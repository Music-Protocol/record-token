// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
//import interface of JTP(erc20) to lock on new stake
interface IJTP {
    function lock(uint256 amount, uint128 end) external;
}

contract FanToArtistStaking is Ownable{
    struct Stake {
        uint256 amount;
        uint128 start;//block.timestamp
        uint128 end;
    }

    mapping( address => mapping(address => Stake) ) private stake;
    //stake[artist][staker] = (new Stake)

    mapping( address => address[] ) private artistStaked;
    //currentStakes[staker] = Array of artist staked (past and present)

    address[] private verifiedArtists;

    mapping( address => uint256 ) private artistAlreadyPaid;

    uint256 private veJTPRewardRate;//change onylOwner
    uint256 private ArtistJTPRewardRate;//change onylOwner


}