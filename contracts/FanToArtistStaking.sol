// SPDX-License-Identifier: MIT

pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IJTP.sol";

contract FanToArtistStaking is Ownable {
    event ArtistAdded(address indexed artist, address indexed sender);
    event ArtistRemoved(address indexed artist, address indexed sender);
    event ArtistStaked(
        address indexed artist,
        address indexed sender,
        uint256 amount,
        uint128 end
    );

    struct Stake {
        uint256 amount;
        uint128 start; //block.timestamp
        uint128 end;
    } //add a checkpoint inside the struct?? TBD costs/benefits?

    IJTP private _JTP;

    mapping(address => mapping(address => Stake)) private _stake;
    //stake[artist][staker] = (new Stake)

    mapping(address => address[]) private _artistStaked;
    //currentStakes[staker] = Array of artist staked (past and present)

    mapping(address => bool) private _verifiedArtists;

    mapping(address => uint256) private _artistAlreadyPaid;

    uint256 private veJTPRewardRate; //change onylOwner
    uint256 private ArtistJTPRewardRate; //change onylOwner

    function setJTP(address _jtp) external onlyOwner {
        require(
            address(_JTP) == address(0),
            "FanToArtistStaking: JTP contract already linked"
        );
        _JTP = IJTP(_jtp);
    }

    modifier onlyVerifiedArtist(address artist) {
        require(
            _verifiedArtists[artist],
            "FanToArtistStaking: the artist is not a verified artist"
        );
        _;
    }

    function isVerified(address artist) external view returns (bool) {
        return _verifiedArtists[artist];
    }

    function addArtist(address artist, address sender) external onlyOwner {
        if (!_verifiedArtists[artist]) {
            _verifiedArtists[artist] = true;
            emit ArtistAdded(artist, sender);
        }
    }

    function removeArtist(address artist, address sender) external onlyOwner {
        if (_verifiedArtists[artist]) {
            _verifiedArtists[artist] = false;
            //stop all stake
            emit ArtistRemoved(artist, sender);
        }
    }

    function stake(
        address artist,
        uint256 amount,
        uint128 end
    ) external onlyVerifiedArtist(artist) {
        //end>now+1week && no current stake
        _JTP.lock(_msgSender(), amount);
        emit ArtistStaked(artist, _msgSender(), amount, end);
    }

    function redeem(address artist, uint256 amount) external {
        artist;//placeholder
        _JTP.unlock(_msgSender(), amount);
    }
}
