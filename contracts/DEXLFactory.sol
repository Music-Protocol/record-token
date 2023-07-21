// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;
import "./DEXLPool.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./interfaces/IDEXLFactory.sol";
import "./interfaces/IFanToArtistStaking.sol";
import "./interfaces/IWeb3MusicNativeToken.sol";
import "./interfaces/SDEXLPool.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract DEXLFactory is
    Ownable2Step,
    IDEXLFactory,
    Initializable,
    ReentrancyGuard
{
    using Math for uint256;

    event PoolCreated(
        address indexed leader,
        address indexed pool,
        uint256 index
    );
    event PoolDeclined(address indexed leader, uint256 indexed index);
    event PoolProposed(uint256 indexed index, Pool pool, string description);
    event PoolRedeem(address indexed pool, uint256 amount);
    event PreferencesCasted(
        address indexed user,
        address[] pools,
        uint256[] amount
    );
    event RewardChanged(uint256 rate, uint256 timestamp);

    struct Nomination {
        uint40 lastVote;
        uint216 amount;
    }

    mapping(uint256 => Pool) private proposals;

    mapping(address => bool) private _pools; //if pool is verified
    mapping(address => uint40) private _lastNomination; //get last vote
    mapping(address => uint40) private _lastRedeem; //get artist last redeem
    mapping(address => uint256) private _userNomination; // hash of the 2 array about last target and amount
    mapping(address => uint256) private _poolNomination; // amount nominated to each pool
    uint256 private _totalNomination;
    uint256 private _dexlRewardRate;

    address private _ftas;
    address private _implementationDEXLPool;
    IWeb3MusicNativeToken private _web3MusicNativeToken;

    uint64 private _cooldown;

    function initialize(
        address ftas_,
        address implementation_,
        address web3MusicNativeToken_,
        uint40 cooldown_,
        uint256 rate_
    ) public initializer {
        require(rate_ <= 10e8, "DEXLFactory: illegal rate");
        require(
            ftas_ != address(0),
            "DEXLFactory: fanToArtistStaking address can not be 0"
        );
        require(
            implementation_ != address(0),
            "DEXLFactory: implementation address can not be 0"
        );
        require(
            web3MusicNativeToken_ != address(0),
            "DEXLFactory: Web3MusicNativeToken address can not be 0"
        );
        _web3MusicNativeToken = IWeb3MusicNativeToken(web3MusicNativeToken_);
        _ftas = ftas_;
        _implementationDEXLPool = implementation_;
        _cooldown = cooldown_;
        _dexlRewardRate = rate_;
    }

    function transferOwnership(
        address to
    ) public override(IDEXLFactory, Ownable2Step) onlyOwner {
        super.transferOwnership(to);
    }

    function renounceOwnership() public override(Ownable) onlyOwner {
        require(false, "function disabled");
        super.renounceOwnership();
    }

    function changeRewardRate(uint256 rate_) public override onlyOwner {
        require(rate_ > 0, "DEXLFactory: rate cant be 0");
        _dexlRewardRate = rate_;
        emit RewardChanged(rate_, block.timestamp);
    }

    function proposePool(
        PoolReduced memory pool,
        string memory description
    ) external {
        require(
            pool.softCap <= pool.hardCap,
            "DEXLFactory: softcap must be less or equal than the hardcap"
        );
        require(
            pool.raiseEndDate < pool.terminationDate,
            "DEXLFactory: raiseEndDate must be less than the terminationDate"
        );
        require(
            pool.fundingTokenContract != address(0),
            "DEXLFactory: the funding token contract's address can not be 0"
        );
        require(
            pool.couponAmount <= 10e8,
            "DEXLFactory: couponAmount value must be between 0 and 10e8"
        );
        require(
            pool.leaderCommission <= 10e8,
            "DEXLFactory: leaderCommission value must be between 0 and 10e8"
        );
        require(
            pool.couponAmount + pool.leaderCommission <= 10e8,
            "DEXLFactory: the sum of leaderCommission and couponAmount must be lower than 10e8"
        );
        require(
            pool.quorum <= 10e8,
            "DEXLFactory: quorum value must be between 0 and 10e8"
        );
        require(
            pool.majority <= 10e8,
            "DEXLFactory: majority value must be between 0 and 10e8"
        );
        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(pool.fundingTokenContract),
            _msgSender(),
            address(this),
            pool.initialDeposit
        );
        uint256 hashProp = uint256(
            keccak256(abi.encode(msg.sender, pool, block.timestamp))
        );
        proposals[hashProp] = Pool({
            leader: msg.sender,
            fundingTokenContract: pool.fundingTokenContract,
            leaderCommission: pool.leaderCommission,
            softCap: pool.softCap,
            hardCap: pool.hardCap,
            raiseEndDate: pool.raiseEndDate,
            couponAmount: pool.couponAmount,
            initialDeposit: pool.initialDeposit,
            terminationDate: pool.terminationDate,
            votingTime: pool.votingTime,
            // transferrable: pool.transferrable,
            quorum: pool.quorum,
            majority: pool.majority
        });
        emit PoolProposed(hashProp, proposals[hashProp], description);
    }

    function getProposal(uint256 index) public view returns (Pool memory) {
        return proposals[index];
    }

    function changeImplementation(
        address newImplementation
    ) external onlyOwner {
        _implementationDEXLPool = newImplementation;
    }

    function approveProposal(
        uint256 index
    ) external onlyOwner nonReentrant returns (address) {
        require(
            proposals[index].leader != address(0),
            "DEXLFactory: Proposal can not be deployed"
        );
        address pool = Clones.clone(_implementationDEXLPool);
        DEXLPool(pool).initialize(
            proposals[index],
            _msgSender(),
            _ftas,
            address(_web3MusicNativeToken)
        );
        SafeERC20Upgradeable.safeTransfer(
            IERC20Upgradeable(proposals[index].fundingTokenContract),
            pool,
            proposals[index].initialDeposit
        );
        _pools[pool] = true;
        emit PoolCreated(proposals[index].leader, pool, index);
        delete proposals[index];
        return pool;
    }

    function declineProposal(uint256 index) external nonReentrant {
        require(
            owner() == _msgSender() || _msgSender() == proposals[index].leader,
            "DEXLFactory: a proposal can only be declined by the leader or the owner"
        );
        //sendback the money to the leader
        require(
            proposals[index].leader != address(0),
            "DEXLFactory: Proposal can not be deployed"
        );

        SafeERC20Upgradeable.safeTransfer(
            IERC20Upgradeable(proposals[index].fundingTokenContract),
            proposals[index].leader,
            proposals[index].initialDeposit
        );
        delete proposals[index];
        emit PoolDeclined(proposals[index].leader, index);
    }

    function redeem(
        uint256 raiseEndDate
    ) external virtual override returns (uint256) {
        require(_pools[_msgSender()], "DEXLFactory: the pool is not official");
        uint256 amountWeb3MusicNativeTokenEligible = IWeb3MusicNativeToken(
            _web3MusicNativeToken
        ).balanceOf(_ftas).mulDiv(
                _poolNomination[_msgSender()],
                _totalNomination
            );

        uint256 amount = amountWeb3MusicNativeTokenEligible.mulDiv(
            (block.timestamp -
                Math.max(_lastRedeem[_msgSender()], raiseEndDate)),
            _dexlRewardRate
        );

        IWeb3MusicNativeToken(_web3MusicNativeToken).pay(_msgSender(), amount);
        _lastRedeem[_msgSender()] = uint40(block.timestamp);
        emit PoolRedeem(_msgSender(), amount);
        return amount;
    }

    function castPreference(
        address[] memory targetPools,
        uint64[] memory rate,
        address[] memory prevPools,
        uint256[] memory prevCasted
    ) external {
        require(
            uint256(keccak256(abi.encode(prevPools, prevCasted))) ==
                _userNomination[_msgSender()] ||
                _userNomination[_msgSender()] == 0,
            "DEXLFactory: prevPools doesnt match"
        );
        require(
            block.timestamp - _lastNomination[_msgSender()] >= _cooldown,
            "DEXLFactory: cooldown still active"
        );
        _lastNomination[_msgSender()] = uint40(block.timestamp);
        require(
            targetPools.length == rate.length && targetPools.length > 0,
            "DEXLFactory: parameter error, different length or empty"
        );
        uint64 totalRate = 0;
        for (uint i = 0; i < targetPools.length; i++) {
            require(
                _pools[targetPools[i]],
                "DEXLFactory: one of the pool in targetPools is not official"
            );
            require(
                DEXLPool(targetPools[i]).isActive(),
                "DEXLFactory: one of the pool in targetPools is not active"
            );
            require(
                rate[i] > 0 && rate[i] <= 10e8,
                "DEXLFactory: the rate must be between 1 and 10e8"
            );
            totalRate += rate[i];
        }
        require(
            totalRate == 10e8,
            "DEXLFactory: the sum of the rate is not 10e8"
        );
        uint256 votingPower = IFanToArtistStaking(_ftas).votingPowerOf(
            _msgSender()
        );
        require(
            votingPower > 0,
            "DEXLFactory: no voting power gained since the last vote"
        );
        uint256 accumulator = 0;
        for (uint i = 0; i < prevPools.length; i++) {
            accumulator += prevCasted[i];
            _poolNomination[prevPools[i]] -= prevCasted[i];
        }
        _totalNomination -= accumulator;

        uint256[] memory amountCasted = new uint[](targetPools.length);
        accumulator = 0;
        for (uint i = 0; i < targetPools.length; i++) {
            amountCasted[i] = (votingPower.mulDiv(rate[i], 10e8));
            _poolNomination[targetPools[i]] += amountCasted[i];
            accumulator += amountCasted[i];
        }
        _totalNomination += accumulator;
        _userNomination[_msgSender()] = uint256(
            keccak256(abi.encode(targetPools, amountCasted))
        );
        emit PreferencesCasted(_msgSender(), targetPools, amountCasted);
    }

    function getPreferences(
        address[] memory targetPools
    ) external view returns (uint256[] memory) {
        uint256[] memory amountCasted = new uint[](targetPools.length);
        for (uint256 i = 0; i < targetPools.length; i++)
            amountCasted[i] = (_poolNomination[targetPools[i]]);
        return amountCasted;
    }

    function getTotalNomination() external view returns (uint256) {
        return _totalNomination;
    }
}
