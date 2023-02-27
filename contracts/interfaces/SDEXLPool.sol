// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

struct Pool {
    address leader;
    address fundingTokenContract;
    uint256 softCap;
    uint256 hardCap;
    uint256 initialDeposit;
    uint128 raiseEndDate;
    uint128 terminationDate;
    uint128 votingTime;
    uint64 leaderCommission;
    uint64 couponAmount;
    uint64 quorum;
    uint64 majority;
    bool deployable;
    bool transferrable;
}
