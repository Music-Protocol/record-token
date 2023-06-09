// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

interface IDEXLFactory {
    function transferOwnership(address to) external;

    function approveProposal(uint256 index) external returns (address);

    function declineProposal(uint256 index) external;

    function changeRewardRate(uint256 rate) external;

    function redeem(uint256 raiseEndDate) external returns (uint256);
}