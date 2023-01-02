// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IJTP.sol";
import "./interfaces/IFanToArtistStaking.sol";
import "./utils/OrderedArray.sol";

contract FanToArtistStaking is IFanToArtistStaking, Ownable {
    event ArtistAdded(address indexed artist, address indexed sender);
    event ArtistRemoved(address indexed artist, address indexed sender);
    event ArtistStaked(
        address indexed artist,
        address indexed sender,
        uint256 amount,
        uint128 end
    );
    event VeJTPRewardChanged(uint128 newRate, address indexed sender);
    event ArtistJTPRewardChanged(uint128 newRate, address indexed sender);

    struct Stake {
        uint256 amount;
        uint128 start; //block.timestamp
        uint128 end;
        uint128 rewardVe;
        uint128 rewardArtist;
    } //add a checkpoint inside the struct?? TBD costs/benefits?

    IJTP private _jtp;

    mapping(address => mapping(address => Stake[])) private _stake;
    //stake[artist][staker] = (new Stake)

    mapping(address => address[]) private _artistStaked;
    //_artistStaked[staker] = Array of artist staked (past and present)

    mapping(address => bool) private _verifiedArtists;

    mapping(address => uint256) private _artistAlreadyPaid;

    uint128 private _veJTPRewardRate; //change onylOwner
    uint128 private _artistJTPRewardRate; //change onylOwner
    uint128 private _minStakePeriod; //change onylOwner
    uint128 private _maxStakePeriod; //change onylOwner

    constructor(
        uint128 veJTPRewardRate,
        uint128 artistJTPRewardRate,
        uint128 min,
        uint128 max
    ) {
        _veJTPRewardRate = veJTPRewardRate;
        _artistJTPRewardRate = artistJTPRewardRate;
        _minStakePeriod = min;
        _maxStakePeriod = max;
    }

    function setJTP(address jtp) external onlyOwner {
        require(
            address(_jtp) == address(0),
            "FanToArtistStaking: JTP contract already linked"
        );
        _jtp = IJTP(jtp);
    }

    modifier onlyVerifiedArtist(address artist) {
        require(
            _verifiedArtists[artist],
            "FanToArtistStaking: the artist is not a verified artist"
        );
        _;
    }

    function transferOwnership(
        address to
    ) public override(IFanToArtistStaking, Ownable) onlyOwner {
        super.transferOwnership(to);
    }

    function _isStaking(
        address sender,
        address artist
    ) internal view returns (bool) {
        int256 index = OrderedArray.binarySearch(_artistStaked[sender], artist);
        return index != -1;
    }

    function _addStake(address sender, address artist, uint128 end, uint256 amount) internal {
        OrderedArray.insertInOrder(_artistStaked[sender], artist);
        _stake[artist][sender].push(Stake({amount: amount,
        start: uint128(block.timestamp),
        end: end,
        rewardVe: _veJTPRewardRate,
        rewardArtist: _artistJTPRewardRate}));
    }

    function searchStake(
        address artist
    ) external view onlyVerifiedArtist(artist) {
        require(
            _isStaking(_msgSender(), artist),
            "FanToArtistStaking: the msg sender is not staking the passed artist"
        );
        //TODO
    }

    function addArtist(
        address artist,
        address sender
    ) external override onlyOwner {
        if (!_verifiedArtists[artist]) {
            _verifiedArtists[artist] = true;
            emit ArtistAdded(artist, sender);
        }
    }

    function removeArtist(
        address artist,
        address sender
    ) external override onlyOwner {
        if (_verifiedArtists[artist]) {
            _verifiedArtists[artist] = false;
            //stop all stake
            emit ArtistRemoved(artist, sender);
        }
    }

    function changeStakingVeRate(
        uint128 rate,
        address sender
    ) external onlyOwner {
        //stop all stakes
        _veJTPRewardRate = rate;
        emit VeJTPRewardChanged(rate, sender);
    }

    function changeArtistRewardRate(
        uint128 rate,
        address sender
    ) external onlyOwner {
        //stop all stakes and create change
        _artistJTPRewardRate = rate;
        emit ArtistJTPRewardChanged(rate, sender);
    }

    function getStakingVeRate() external view returns (uint128) {
        return _veJTPRewardRate;
    }

    function getArtistRewardRate() external view returns (uint128) {
        return _artistJTPRewardRate;
    }

    function stake(
        address artist,
        uint256 amount,
        uint128 end
    ) external onlyVerifiedArtist(artist) {
        require(
            end > (block.timestamp + _minStakePeriod),
            "FanToArtistStaking: the end period is less than minimum"
        );
        require(
            (end - block.timestamp) > _maxStakePeriod,
            "FanToArtistStaking: the stake period exceed the maximum"
        );
        // require(!_isStaking(_msgSender(), artist), "FanToArtistStaking: already staking");
        // require(!_isStaking(_msgSender(), artist), "FanToArtistStaking: already staking");
        _jtp.lock(_msgSender(), amount);
        _addStake(_msgSender(), artist, end, amount);
        emit ArtistStaked(artist, _msgSender(), amount, end);
    }

    function redeem(address artist, uint256 amount) external {
        artist; //placeholder
        _jtp.unlock(_msgSender(), amount);
    }

    function isVerified(address artist) external view returns (bool) {
        return _verifiedArtists[artist];
    }
}
