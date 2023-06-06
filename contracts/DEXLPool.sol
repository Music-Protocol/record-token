// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/SDEXLPool.sol";
import "./interfaces/IFanToArtistStaking.sol";

contract DEXLPool is ERC4626Upgradeable, OwnableUpgradeable {
    using Math for uint256;
    event ReferendumProposed(
        address indexed proposer,
        uint256 indexed hash,
        uint40 endTime,
        string description
    );
    event EarlyClosureProposed(
        address indexed proposer,
        uint256 indexed hash,
        uint40 endTime,
        string description
    );
    event FoundingProposed(
        address indexed proposer,
        address indexed artist,
        uint256 indexed hash,
        uint256 amount,
        uint40 endTime,
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
    event LeaderChanged(address indexed voter);
    event ArtistNominated(address indexed artist);
    event ArtistRemoved(address indexed artist);

    IFanToArtistStaking private _ftas;
    address private _leader;
    address private _fundingTokenContract;
    uint256 private _softCap;
    uint256 private _hardCap;
    uint256 private _initialDeposit;
    //40 for timestamp == 35k years in the future
    uint40 private _raiseEndDate;
    uint40 private _terminationDate;
    uint40 private _votingTime;

    uint32 private _leaderCommission;
    uint32 private _couponAmount;
    uint32 private _quorum;
    uint32 private _majority;
    bool private _transferrable;
    // a uint128 can be added without taking another slot

    address[] private _shareholders;

    struct Proposal {
        address target;
        uint256 votesFor;
        uint256 votesAgainst;
        uint40 endTime;
        bytes encodedRequest;
    }
    mapping(uint256 => mapping(address => bool)) private _votes; //hash collision of keccack256
    //votes[index of_proposals][address of voters] = true if voted, false if not
    mapping(uint256 => Proposal) private _proposals;

    //--------------artist nomination-----------------
    //internal
    address[] private _artistNominated;

    //modified by factory

    function initialize(
        Pool memory pool,
        address newOwner,
        address ftas_
    ) public initializer {
        //ERC20("Shares", "SHR")
        // super.__ERC20_init();
        super.__ERC4626_init(IERC20Upgradeable(pool.fundingTokenContract));
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
        _ftas = IFanToArtistStaking(ftas_);
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
            totalSupply() >= _softCap &&
                block.timestamp > _raiseEndDate &&
                block.timestamp < _terminationDate,
            "DEXLPool: is not active"
        );
        _;
    }

    function _isNeverBeenShareholder(
        address target
    ) internal view returns (bool) {
        for (uint256 i = 0; i < _shareholders.length; i++) {
            if (_shareholders[i] == target) return true;
        }
        return false;
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

    function isActive() external view returns (bool) {
        return
            totalSupply() >= _softCap &&
            block.timestamp > _raiseEndDate &&
            block.timestamp < _terminationDate;
    }

    function getLeader() external view returns (address) {
        return _leader;
    }

    function setLeader(address leader_) external onlyOwner {
        require(
            leader_ != address(0),
            "DEXLPool: the new leader's address can not be 0"
        );
        _leader = leader_;
        emit LeaderChanged(leader_);
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
            totalAssets() + assets <= _hardCap,
            "DEXLPool: you can not deposit more than hardcap"
        );
        if (!_isNeverBeenShareholder(receiver)) _shareholders.push(receiver);
        return super.deposit(assets, receiver);
    }

    function mint(
        uint256 shares,
        address receiver
    ) public virtual override returns (uint256) {
        uint256 assets = previewMint(shares);
        require(
            block.timestamp < _raiseEndDate,
            "DEXLPool: you can not join a pool after the raise end date"
        );
        require(
            totalAssets() + assets <= _hardCap,
            "DEXLPool: you can not deposit more than hardcap"
        );
        if (!_isNeverBeenShareholder(receiver)) _shareholders.push(receiver);
        return super.deposit(assets, receiver);
    }

    function redistributeRevenue(uint256 amount) external {
        require(amount != 0, "DEXLPool: the amount can not be 0");
        require(
            IERC20Upgradeable(_fundingTokenContract).transferFrom(
                _msgSender(),
                address(this),
                amount
            ),
            "ERC20 operation did not succeed"
        );
        uint256 leaderReward = uint256(_leaderCommission).mulDiv(
            amount,
            10e8,
            Math.Rounding.Down
        );
        require(
            IERC20Upgradeable(_fundingTokenContract).transfer(
                _leader,
                leaderReward
            ),
            "ERC20 operation did not succeed"
        );
        amount = amount.mulDiv(_couponAmount, 10e8, Math.Rounding.Down);

        for (uint256 i = 0; i < _shareholders.length; i++) {
            uint256 toPay = amount.mulDiv(
                balanceOf(_shareholders[i]),
                totalSupply(),
                Math.Rounding.Down
            );
            require(
                IERC20Upgradeable(_fundingTokenContract).transfer(
                    _shareholders[i],
                    toPay
                ),
                "ERC20 operation did not succeed"
            );
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

    function executeProposal(uint256 index) external activePool {
        require(
            block.timestamp > _proposals[index].endTime,
            "DEXLPool: the end time of the proposal is not reached"
        );
        if (
            _proposals[index].votesFor + _proposals[index].votesAgainst >
            uint256(_quorum).mulDiv(totalSupply(), 10e8) &&
            _proposals[index].votesFor >
            uint256(_majority).mulDiv(
                (_proposals[index].votesFor + _proposals[index].votesAgainst),
                10e8
            )
        ) {
            bytes memory request = _proposals[index].encodedRequest;
            if (keccak256(request) != keccak256(abi.encodePacked(""))) {
                (bool success, ) = (_proposals[index].target).call(request);
                require(success, "something went wrong");
            }
        }

        delete _proposals[index];
        emit ProposalExecuted(index, _msgSender());
    }

    function voteProposal(
        uint256 index,
        bool isFor
    ) external onlyShareholder activePool {
        require(
            block.timestamp <= _proposals[index].endTime,
            "DEXLPool: the time is ended"
        );
        uint256 hashVote = uint256(
            keccak256(abi.encode(index, _proposals[index].endTime))
        );
        require(
            !_votes[hashVote][_msgSender()],
            "DEXLPool: caller already voted"
        );

        if (isFor) _proposals[index].votesFor += balanceOf(_msgSender());
        else _proposals[index].votesAgainst += balanceOf(_msgSender());

        _votes[hashVote][_msgSender()] = true;

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
            endTime: uint40(block.timestamp) + _votingTime,
            target: address(0),
            encodedRequest: request
        });
        emit ReferendumProposed(
            _msgSender(),
            hashProp,
            uint40(block.timestamp) + _votingTime,
            description
        );
    }

    function proposeEarlyClosure(
        string memory description
    ) external onlyShareholder activePool {
        bytes memory request = abi.encodeWithSignature(
            "changeTerminationDate()"
        );
        uint256 hashProp = _hashProp(keccak256(bytes(description)));

        _proposals[hashProp] = Proposal({
            votesFor: 0,
            votesAgainst: 0,
            endTime: uint40(block.timestamp) + _votingTime,
            target: address(this),
            encodedRequest: request
        });
        emit EarlyClosureProposed(
            _msgSender(),
            hashProp,
            uint40(block.timestamp) + _votingTime,
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
            endTime: uint40(block.timestamp) + _votingTime,
            encodedRequest: request
        });
        emit FoundingProposed(
            _msgSender(),
            artist,
            hashProp,
            value,
            uint40(block.timestamp) + _votingTime,
            description
        );
    }

    function changeTerminationDate() external {
        require(
            _msgSender() == address(this),
            "DEXLPool::changeTerminationDate: can only be called by the contract itself"
        );
        _terminationDate = uint40(block.timestamp);
    }

    function getTerminationDate() external view returns (uint256) {
        return _terminationDate;
    }

    function _getNominationIndex(
        address artist
    ) internal view returns (uint256) {
        for (uint i = 0; i < _artistNominated.length; i++)
            if (_artistNominated[i] == artist) return i;
        return 0;
    }

    function addArtist(address artist) external onlyLeader activePool {
        uint256 index = _getNominationIndex(artist);
        require(
            _artistNominated.length == 0 || _artistNominated[index] != artist,
            "DEXLPool: artist already nominated"
        );
        require(
            _ftas.isVerified(artist),
            "DEXLPool::artistNomination: the artist is not verified"
        );
        _artistNominated.push(artist);

        emit ArtistNominated(artist);
    }

    function removeArtist(address artist) external onlyLeader activePool {
        uint256 index = _getNominationIndex(artist);
        require(
            _artistNominated.length > 0 && (_artistNominated[index] == artist),
            "DEXLPool: artist not nominated"
        );
        //shifting
        for (uint256 i = index; i < _artistNominated.length - 1; i++)
            _artistNominated[i] = _artistNominated[i + 1];
        _artistNominated.pop();

        emit ArtistRemoved(artist);
    }

    function isNominated(address artist) external view returns (bool) {
        return _artistNominated[_getNominationIndex(artist)] == artist;
    }

    function getTotalNominations() external view returns (uint256) {
        uint counter = 0;
        for (uint i = 0; i < _artistNominated.length; i++)
            if (_ftas.isVerified(_artistNominated[i])) counter++;
        return 10e8 / counter;
    }

    // OVERRIDEN METHODS OF TRANSFER

    function transfer(
        address to,
        uint256 amount
    )
        public
        virtual
        override(ERC20Upgradeable, IERC20Upgradeable)
        returns (bool)
    {
        require(_transferrable, "DEXLPool: function disabled");
        if (!_isNeverBeenShareholder(to)) _shareholders.push(to);
        return super.transfer(to, amount);
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    )
        public
        virtual
        override(ERC20Upgradeable, IERC20Upgradeable)
        returns (bool)
    {
        require(_transferrable, "DEXLPool: function disabled");
        if (!_isNeverBeenShareholder(to)) _shareholders.push(to);
        return super.transferFrom(from, to, amount);
    }

    function approve(
        address spender,
        uint256 amount
    )
        public
        virtual
        override(ERC20Upgradeable, IERC20Upgradeable)
        returns (bool)
    {
        require(_transferrable, "DEXLPool: function disabled");
        return super.approve(spender, amount);
    }

    function allowance(
        address owner,
        address spender
    )
        public
        view
        virtual
        override(ERC20Upgradeable, IERC20Upgradeable)
        returns (uint256)
    {
        require(_transferrable, "DEXLPool: function disabled");
        return super.allowance(owner, spender);
    }

    function increaseAllowance(
        address spender,
        uint256 addedValue
    ) public virtual override(ERC20Upgradeable) returns (bool) {
        require(_transferrable, "DEXLPool: function disabled");
        return super.increaseAllowance(spender, addedValue);
    }

    function decreaseAllowance(
        address spender,
        uint256 subtractedValue
    ) public virtual override(ERC20Upgradeable) returns (bool) {
        require(_transferrable, "DEXLPool: function disabled");
        return super.decreaseAllowance(spender, subtractedValue);
    }
}
