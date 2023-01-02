// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IJTP.sol";
import "./interfaces/IFanToArtistStaking.sol";

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
    //currentStakes[staker] = Array of artist staked (past and present)

    mapping(address => bool) private _verifiedArtists;

    mapping(address => uint256) private _artistAlreadyPaid;

    uint128 private _veJTPRewardRate; //change onylOwner
    uint128 private _artistJTPRewardRate; //change onylOwner

    constructor(uint128 veJTPRewardRate, uint128 artistJTPRewardRate) {
        _veJTPRewardRate = veJTPRewardRate;
        _artistJTPRewardRate = artistJTPRewardRate;
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
        //end>now+1week && no current stake
        _jtp.lock(_msgSender(), amount);
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
