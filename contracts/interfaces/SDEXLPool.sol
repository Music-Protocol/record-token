// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

struct Pool {
    address leader;
    address fundingTokenContract;
    uint256 softCap;
    uint256 hardCap;
    uint256 initialDeposit;
    uint40 raiseEndDate;
    uint40 terminationDate;
    uint40 votingTime;
    uint32 leaderCommission;
    uint32 couponAmount;
    uint32 quorum;
    uint32 majority;
    // bool transferrable;
}

struct PoolReduced {
    address fundingTokenContract;
    uint256 softCap;
    uint256 hardCap;
    uint256 initialDeposit;
    uint40 raiseEndDate;
    uint40 terminationDate;
    uint40 votingTime;
    uint32 leaderCommission;
    uint32 couponAmount;
    uint32 quorum;
    uint32 majority;
    // bool transferrable;
}
