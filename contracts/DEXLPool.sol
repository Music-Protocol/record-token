// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";
import "./interfaces/SDEXLPool.sol";

contract DEXLPool is ERC4626, Ownable {
    using Math for uint256;
    event ReferendumProposed(
        address indexed proposer,
        uint256 indexed hash,
        uint256 endTime,
        string description
    );
    event EarlyClosureProposed(
        address indexed proposer,
        uint256 indexed hash,
        uint256 endTime,
        string description
    );
    event FoundingProposed(
        address indexed proposer,
        address indexed artist,
        uint256 indexed hash,
        uint256 amount,
        uint256 endTime,
        string description
    );
    event ProposalVoted(
        uint256 indexed hash,
        address indexed voter,
        uint256 amount,
        bool isFor
    );
    event ProposalExecuted(uint256 indexed hash, address indexed executor);
    event RevenueRedistributed(address indexed executor, uint256 amount);

    address private _leader;
    address private _fundingTokenContract;
    uint256 private _softCap;
    uint256 private _hardCap;
    uint256 private _initialDeposit;
    uint128 private _raiseEndDate;
    uint128 private _terminationDate;
    uint128 private _votingTime;
    uint64 private _leaderCommission;
    uint64 private _couponAmount;
    uint64 private _quorum;
    uint64 private _majority;
    bool private _transferrable;

    address[] private _shareholders;

    struct Proposal {
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 endTime;
        address target;
        bytes encodedRequest;
    }
    mapping(uint256 => mapping(address => bool)) _votes; //hash collision of keccack256
    //votes[index of_proposals][address of voters] = true if voted, false if not
    mapping(uint256 => Proposal) private _proposals;

    constructor(
        Pool memory pool,
        address newOwner
    ) ERC4626(IERC20(pool.fundingTokenContract)) ERC20("Shares", "SHR") {
        _leader = pool.leader;
        _softCap = pool.softCap;
        _hardCap = pool.hardCap;
        _fundingTokenContract = pool.fundingTokenContract;
        _raiseEndDate = pool.raiseEndDate;
        _couponAmount = pool.couponAmount;
        _initialDeposit = pool.initialDeposit;
        _terminationDate = pool.terminationDate;
        _shareholders.push(pool.leader);
        _leaderCommission = pool.leaderCommission;
        _transferrable = pool.transferrable;
        _votingTime = pool.votingTime;
        _quorum = pool.quorum;
        _majority = pool.majority;
        super._mint(pool.leader, pool.initialDeposit);
        _transferOwnership(newOwner);
    }

    modifier onlyLeader() {
        require(_leader == _msgSender(), "DEXLPool: caller is not the leader");
        _;
    }

    modifier onlyShareholder() {
        require(
            _isShareholder(_msgSender()),
            "DEXLPool: caller is not a shareholder"
        );
        _;
    }

    modifier activePool() {
        require(
            block.timestamp > _raiseEndDate &&
                block.timestamp < _terminationDate,
            "DEXLPool: is not active"
        );
        _;
    }

    function _isShareholder(address target) internal view returns (bool) {
        return balanceOf(target) != 0;
    }

    function _hashProp(bytes32 description) internal view returns (uint256) {
        return
            uint256(
                keccak256(
                    abi.encode(
                        msg.sender,
                        block.timestamp,
                        description,
                        gasleft()
                    )
                )
            );
    }

    function getLeader() external view returns (address) {
        return _leader;
    }

    function setLeader(address leader_) external onlyOwner {
        _leader = leader_;
    }

    function deposit(
        uint256 assets,
        address receiver
    ) public virtual override returns (uint256) {
        require(
            block.timestamp < _raiseEndDate,
            "DEXLPool: you can not join a pool after the raise end date"
        );
        require(
            totalSupply() + assets <= _hardCap,
            "DEXLPool: you can not deposit more than hardcap"
        );
        if (!_isShareholder(receiver)) _shareholders.push(receiver);
        return super.deposit(assets, receiver);
    }

    function redistributeRevenue(uint256 amount) external {
        require(amount != 0, "DEXLPool: the amount can not be 0");
        IERC20(_fundingTokenContract).transferFrom(
            _msgSender(),
            address(this),
            amount
        );
        uint256 leaderReward = uint256(_leaderCommission).mulDiv(
            amount,
            10e9,
            Math.Rounding.Down
        );
        IERC20(_fundingTokenContract).transfer(_leader, leaderReward);
        amount = amount.mulDiv(_couponAmount, 10e9, Math.Rounding.Down);

        for (uint256 i = 0; i < _shareholders.length; i++) {
            uint256 toPay = amount.mulDiv(
                balanceOf(_shareholders[i]),
                totalSupply(),
                Math.Rounding.Down
            );
            IERC20(_fundingTokenContract).transfer(_shareholders[i], toPay);
        }
        emit RevenueRedistributed(_msgSender(), amount);
    }

    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public virtual override returns (uint256) {
        require(
            _raiseEndDate <= block.timestamp,
            "DEXLPool: you can not withdraw before the raise end date"
        );
        require(
            (totalAssets() < _softCap),
            "DEXLPool: you can not withdraw if the soft cap is reached"
        );
        return super.withdraw(assets, receiver, owner);
    }

    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public virtual override returns (uint256) {
        require(
            block.timestamp > _terminationDate,
            "DEXLPool: you can not redeem before the termination date"
        );
        return super.redeem(shares, receiver, owner);
    }

    function executeProposal(uint256 index) external {
        require(
            block.timestamp > _proposals[index].endTime,
            "DEXLPool: the end time of the proposal is not reached"
        );
        require(
            _proposals[index].votesFor + _proposals[index].votesAgainst >
                uint256(_quorum).mulDiv(totalSupply(), 10e9),
            "DEXLPool: quorum not reached"
        );
        require(
            _proposals[index].votesFor >
                uint256(_majority).mulDiv(
                    (_proposals[index].votesFor +
                        _proposals[index].votesAgainst),
                    10e9
                ),
            "DEXLPool: votes For not reached the majority"
        );
        bytes memory request = _proposals[index].encodedRequest;
        if (keccak256(request) != keccak256(abi.encodePacked(""))) {
            (bool success, ) = (_proposals[index].target).call(request);
            require(success, "something went wrong");
        }
        delete _proposals[index];
        emit ProposalExecuted(index, _msgSender());
    }

    function voteProposal(uint256 index, bool isFor) external onlyShareholder {
        require(
            block.timestamp <= _proposals[index].endTime,
            "DEXLPool: the time is ended"
        );
        require(!_votes[index][_msgSender()], "DEXLPool: caller already voted");

        if (isFor) _proposals[index].votesFor += balanceOf(_msgSender());
        else _proposals[index].votesAgainst += balanceOf(_msgSender());

        _votes[index][_msgSender()] = true;

        emit ProposalVoted(index, msg.sender, balanceOf(_msgSender()), isFor);
    }

    function proposeReferendum(
        string memory description
    ) external onlyShareholder activePool {
        bytes memory request = "";
        uint256 hashProp = _hashProp(keccak256(bytes(description)));
        _proposals[hashProp] = Proposal({
            votesFor: 0,
            votesAgainst: 0,
            endTime: block.timestamp + _votingTime,
            target: address(0),
            encodedRequest: request
        });
        emit ReferendumProposed(
            _msgSender(),
            hashProp,
            block.timestamp + _votingTime,
            description
        );
    }

    function proposeEarlyClosure(
        string memory description
    ) external onlyShareholder activePool {
        bytes memory request = abi.encodeWithSignature(
            "_changeTerminationDate()"
        );
        uint256 hashProp = _hashProp(keccak256(bytes(description)));

        _proposals[hashProp] = Proposal({
            votesFor: 0,
            votesAgainst: 0,
            endTime: block.timestamp + _votingTime,
            target: address(this),
            encodedRequest: request
        });
        emit EarlyClosureProposed(
            _msgSender(),
            hashProp,
            block.timestamp + _votingTime,
            description
        );
    }

    function proposeFounding(
        address artist,
        uint256 value,
        string memory description
    ) external onlyLeader activePool {
        bytes memory request = abi.encodeWithSignature(
            "transfer(address,uint256)",
            artist,
            value
        );
        uint256 hashProp = _hashProp(keccak256(bytes(description)));

        _proposals[hashProp] = Proposal({
            votesFor: 0,
            votesAgainst: 0,
            target: _fundingTokenContract,
            endTime: block.timestamp + _votingTime,
            encodedRequest: request
        });
        emit FoundingProposed(
            _msgSender(),
            artist,
            hashProp,
            block.timestamp + _votingTime,
            value,
            description
        );
    }

    function _changeTerminationDate() external {
        require(
            _msgSender() == address(this),
            "DEXLPool::_changeTerminationDate: can only be called by the contract itself"
        );
        _terminationDate = uint128(block.timestamp);
    }

    function getTerminationDate() external view returns (uint256) {
        return _terminationDate;
    }

    // OVERRIDEN METHODS OF TRANSFER

    function transfer(
        address to,
        uint256 amount
    ) public virtual override(ERC20, IERC20) returns (bool) {
        require(_transferrable, "DEXLPool: function disabled");
        if (!_isShareholder(to)) _shareholders.push(to);
        return super.transfer(to, amount);
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public virtual override(ERC20, IERC20) returns (bool) {
        require(_transferrable, "DEXLPool: function disabled");
        if (!_isShareholder(to)) _shareholders.push(to);
        return super.transferFrom(from, to, amount);
    }

    function approve(
        address spender,
        uint256 amount
    ) public virtual override(ERC20, IERC20) returns (bool) {
        require(_transferrable, "DEXLPool: function disabled");
        return super.approve(spender, amount);
    }

    function allowance(
        address owner,
        address spender
    ) public view virtual override(ERC20, IERC20) returns (uint256) {
        require(_transferrable, "DEXLPool: function disabled");
        return super.allowance(owner, spender);
    }

    function increaseAllowance(
        address spender,
        uint256 addedValue
    ) public virtual override(ERC20) returns (bool) {
        require(_transferrable, "DEXLPool: function disabled");
        return super.increaseAllowance(spender, addedValue);
    }

    function decreaseAllowance(
        address spender,
        uint256 subtractedValue
    ) public virtual override(ERC20) returns (bool) {
        require(_transferrable, "DEXLPool: function disabled");
        return super.decreaseAllowance(spender, subtractedValue);
    }
}
