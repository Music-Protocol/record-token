// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

interface IFanToArtistStaking {
    function addArtist(address artist, address sender) external;

    function removeArtist(address artist, address sender) external;

    function transferOwnership(address to) external;

    function totalVotingPower() external returns (uint256);

    function totalVotingPowerAt(uint256 timestamp) external returns (uint256);

    function votingPowerOf(address user) external returns (uint256);

    function votingPowerOfAt(address user, uint256 timestamp) external returns (uint256);
}
