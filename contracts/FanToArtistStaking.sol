// SPDX-License-Identifier: MIT

pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IJTP.sol";

contract FanToArtistStaking is Ownable {
    event ArtistAdded(address indexed artist, address indexed sender);
    event ArtistRemoved(address indexed artist, address indexed sender);

    struct Stake {
        uint256 amount;
        uint128 start; //block.timestamp
        uint128 end;
    }

    mapping(address => mapping(address => Stake)) private stake;
    //stake[artist][staker] = (new Stake)

    mapping(address => address[]) private artistStaked;
    //currentStakes[staker] = Array of artist staked (past and present)

    mapping(address => bool) private verifiedArtists;

    mapping(address => uint256) private artistAlreadyPaid;

    uint256 private veJTPRewardRate; //change onylOwner
    uint256 private ArtistJTPRewardRate; //change onylOwner

    modifier onlyVerifiedArtist(address artist) {
        require(
            verifiedArtists[artist],
            "onlyVerifiedArtist: the artist is not a verified Artist"
        );
        _;
    }

    function isVerified(address artist) external view returns (bool) {
        return verifiedArtists[artist];
    }

    function addArtist(address artist, address sender) external onlyOwner{
        if (!verifiedArtists[artist]) {
            verifiedArtists[artist]=true;
            emit ArtistAdded(artist, sender);
        }
    }

    function removeArtist(address artist, address sender) external onlyOwner{
        if (verifiedArtists[artist]) {
            verifiedArtists[artist]=false;
            //stop all stake
            emit ArtistRemoved(artist, sender);
        }
    }
}
