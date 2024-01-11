// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

interface IFanToArtistStaking {
    function addArtist(address artist, address sender) external;

    function removeArtist(address artist, address sender) external;

    function isVerified(address artist) external view returns (bool);

    function transferOwnership(address to) external;

    function getTotalSupply() external returns (uint256);

    function getPastTotalSupply(uint256 blockNumber) external returns (uint256);

    function getPastVotes(address account, uint256 blockNumber) external returns (uint256);

    function getVotes(address account) external returns (uint256);

    function changeArtistRewardRate(uint256 rate, address sender) external;
}
