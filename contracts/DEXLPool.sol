// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/SDEXLPool.sol";
import "./interfaces/IFanToArtistStaking.sol";
import "./interfaces/IDEXLFactory.sol";

contract DEXLPool is ERC4626Upgradeable, OwnableUpgradeable {
    using Math for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;

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
    event FundingProposed(
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
    event RequestCreated(
        address indexed requester,
        uint256 indexed assets,
        address indexed receiver
    );
    event ProposalExecuted(uint256 indexed hash, address indexed executor);
    event RevenueRedistributed(address indexed executor, uint256 amount);
    event LeaderChanged(address indexed voter);
    event ArtistNominated(address indexed artist);
    event ArtistRemoved(address indexed artist);

    IFanToArtistStaking private _ftas;
    address private _jtp;
    address private _leader;
    address private _fundingTokenContract;
    address private _factory;
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

    uint32 private constant MAX_SHAREHOLDER = 18;
    uint32 private constant MAX_ARTIST = 50;

    bool private _transferrable;
    // a uint128 can be added without taking another slot

    EnumerableSet.AddressSet private _shareholders;

    struct Request {
        address receiver;
        uint256 assets;
    }
    mapping(address => Request) private _requests;

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
    EnumerableSet.AddressSet private _artistNominated;

    constructor() {
        _disableInitializers();
    }

    //modified by factory
    function initialize(
        Pool memory pool,
        address newOwner,
        address ftas_,
        address jtp_
    ) public initializer {
        _factory = _msgSender();
        require(
            pool.softCap <= pool.hardCap,
            "DEXLPool: softcap must be less or equal than the hardcap"
        );
        require(
            pool.raiseEndDate < pool.terminationDate,
            "DEXLPool: raiseEndDate must be less than the terminationDate"
        );
        require(
            pool.fundingTokenContract != address(0),
            "DEXLPool: the funding token contract's address can not be 0"
        );
        require(
            pool.couponAmount <= 10e8,
            "DEXLPool: couponAmount value must be between 0 and 10e8"
        );
        require(
            pool.leaderCommission <= 10e8,
            "DEXLPool: leaderCommission value must be between 0 and 10e8"
        );
        require(
            pool.couponAmount + pool.leaderCommission <= 10e8,
            "DEXLPool: the sum of leaderCommission and couponAmount must be lower than 10e8"
        );
        require(
            pool.quorum <= 10e8,
            "DEXLPool: quorum value must be between 0 and 10e8"
        );
        require(
            pool.majority <= 10e8,
            "DEXLPool: majority value must be between 0 and 10e8"
        );
        require(
            newOwner != address(0),
            "DEXLPool: the new owner's address can not be 0"
        );
        require(
            ftas_ != address(0),
            "DEXLPool: the fanToArtistStaking address can not be 0"
        );
        require(jtp_ != address(0), "DEXLPool: the jtp address can not be 0");
        super.__ERC4626_init(IERC20Upgradeable(pool.fundingTokenContract));
        _leader = pool.leader;
        _softCap = pool.softCap;
        _hardCap = pool.hardCap;
        _fundingTokenContract = pool.fundingTokenContract;
        _raiseEndDate = uint40(block.timestamp) + pool.raiseEndDate;
        _couponAmount = pool.couponAmount;
        _initialDeposit = pool.initialDeposit;
        _shareholders.add(pool.leader);
        _terminationDate = uint40(block.timestamp) + pool.terminationDate;
        _leaderCommission = pool.leaderCommission;
        // _transferrable = pool.transferrable;
        _votingTime = pool.votingTime;
        _quorum = pool.quorum;
        _majority = pool.majority;
        super._mint(pool.leader, pool.initialDeposit);
        _transferOwnership(newOwner);
        _ftas = IFanToArtistStaking(ftas_);
        _jtp = jtp_;
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

    function getActivityTime() external view returns (uint256) {
        return block.timestamp - _raiseEndDate;
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
        // We do not check if a request has already been made
        // because a user may choose to replace it with another one.
        // totalSupply + shares > hardCap is checked on accept()
        require(
            block.timestamp < _raiseEndDate,
            "DEXLPool: you can not join a pool after the raise end date"
        );
        _requests[_msgSender()] = Request({receiver: receiver, assets: assets});
        emit RequestCreated(_msgSender(), assets, receiver);
        return assets;
    }

    function mint(
        uint256 shares,
        address receiver
    ) public virtual override returns (uint256) {
        // We do not check if a request has already been made
        // because a user may choose to replace it with another one.
        // totalSupply + shares > hardCap is checked on accept()
        uint256 assets = previewMint(shares);
        require(
            block.timestamp < _raiseEndDate,
            "DEXLPool: you can not join a pool after the raise end date"
        );
        _requests[_msgSender()] = Request({receiver: receiver, assets: assets});
        emit RequestCreated(_msgSender(), assets, receiver);
        return assets;
    }

    function accept(
        address requester
    ) public virtual onlyLeader returns (uint256) {
        Request memory req = _requests[requester];
        uint256 shares = previewDeposit(req.assets);

        delete _requests[requester];
        require(
            block.timestamp < _raiseEndDate,
            "DEXLPool: you can not join a pool after the raise end date"
        );
        require(
            totalSupply() + shares <= _hardCap,
            "DEXLPool: you can not deposit more than hardcap"
        );
        _shareholders.add(req.receiver);
        require(
            _shareholders.length() <= MAX_SHAREHOLDER,
            "DEXLPool: the maximum number of shareholder has already been reached"
        );

        super._deposit(requester, req.receiver, req.assets, shares);
        return shares;
    }

    function redistributeRevenue(uint256 amount) external {
        require(amount != 0, "DEXLPool: the amount can not be 0");
        require(
            block.timestamp > _raiseEndDate,
            "DEXLPool: the redistribution can happen only after the funding phase"
        );
        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(_fundingTokenContract),
            _msgSender(),
            address(this),
            amount
        );

        uint256 leaderReward = uint256(_leaderCommission).mulDiv(
            amount,
            10e8,
            Math.Rounding.Down
        );
        SafeERC20Upgradeable.safeTransfer(
            IERC20Upgradeable(_fundingTokenContract),
            _leader,
            leaderReward
        );
        amount = amount.mulDiv(_couponAmount, 10e8, Math.Rounding.Down);

        for (uint256 i = 0; i < _shareholders.length(); i++) {
            uint256 toPay = amount.mulDiv(
                balanceOf(_shareholders.at(i)),
                totalSupply(),
                Math.Rounding.Down
            );
            SafeERC20Upgradeable.safeTransfer(
                IERC20Upgradeable(_fundingTokenContract),
                _shareholders.at(i),
                toPay
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
            (totalSupply() < _softCap),
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

    function proposeFunding(
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
        emit FundingProposed(
            _msgSender(),
            artist,
            hashProp,
            value,
            uint40(block.timestamp) + _votingTime,
            description
        );
    }

    function payArtists() public activePool {
        require(
            _artistNominated.length() > 0,
            "DEXLPool::payNominatedArtists: no artist is nominated."
        );
        uint256 amount = IDEXLFactory(_factory).redeem(_raiseEndDate);
        for (uint i = 0; i < _artistNominated.length(); i++) {
            SafeERC20Upgradeable.safeTransfer(
                IERC20Upgradeable(_jtp),
                _artistNominated.at(i),
                amount / _artistNominated.length()
            );
        }
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

    function addArtist(address artist) external onlyLeader activePool {
        require(
            _artistNominated.length() + 1 <= MAX_ARTIST,
            "DEXLPool: artist already nominated"
        );
        require(
            !_artistNominated.contains(artist),
            "DEXLPool: artist already nominated"
        );
        require(
            _ftas.isVerified(artist),
            "DEXLPool::artistNomination: the artist is not verified"
        );
        _artistNominated.add(artist);

        emit ArtistNominated(artist);
    }

    function removeArtist(address artist) external onlyLeader activePool {
        _artistNominated.remove(artist);
        emit ArtistRemoved(artist);
    }

    function removeArtistNotNominated(address artist) external {
        require(
            !_ftas.isVerified(artist),
            "DEXLPool::removeArtistNotNominated: the artist is verified"
        );
        _artistNominated.remove(artist);
        emit ArtistRemoved(artist);
    }

    // OVERRIDEN METHODS OF TRANSFER
    // replace false with _transferrable if in the future we want to allow these methods

    function transfer(
        address to,
        uint256 amount
    )
        public
        virtual
        override(ERC20Upgradeable, IERC20Upgradeable)
        returns (bool)
    {
        require(false, "DEXLPool: function disabled");
        _shareholders.add(to);
        return super.transfer(to, amount);
    }

    function transfer(address to) public virtual returns (bool) {
        require(
            block.timestamp > _raiseEndDate,
            "DEXLPool: the transfer can happen only after the funding phase"
        );
        require(
            _shareholders.add(to),
            "DEXLPool: the transfer can be done only to non-shareholder"
        );
        require(
            _shareholders.remove(_msgSender()),
            "DEXLPool: the transfer can be performed only by a shareholder"
        );
        return super.transfer(to, balanceOf(_msgSender()));
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
        require(false, "DEXLPool: function disabled");
        _shareholders.add(to);
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
        require(false, "DEXLPool: function disabled");
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
        require(false, "DEXLPool: function disabled");
        return super.allowance(owner, spender);
    }

    function increaseAllowance(
        address spender,
        uint256 addedValue
    ) public virtual override(ERC20Upgradeable) returns (bool) {
        require(false, "DEXLPool: function disabled");
        return super.increaseAllowance(spender, addedValue);
    }

    function decreaseAllowance(
        address spender,
        uint256 subtractedValue
    ) public virtual override(ERC20Upgradeable) returns (bool) {
        require(false, "DEXLPool: function disabled");
        return super.decreaseAllowance(spender, subtractedValue);
    }
}
