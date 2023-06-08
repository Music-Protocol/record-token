// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

interface IFanToArtistStaking {
    function addArtist(address artist, address sender) external;

    function removeArtist(address artist, address sender) external;

    function isVerified(address artist) external view returns (bool);

    function transferOwnership(address to) external;

    function totalVotingPower() external returns (uint256);

    function votingPowerOf(address user) external returns (uint256);

    // function calculateOverallStake() external view returns (uint256);

    function changeArtistRewardRate(uint256 rate, address sender) external;
}
