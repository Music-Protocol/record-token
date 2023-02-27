// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;
import "./DEXLPool.sol";
import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IDEXLFactory.sol";
import "./interfaces/SDEXLPool.sol";

contract DEXLFactory is Ownable, IDEXLFactory {
    event PoolCreated(
        address indexed leader,
        address indexed pool,
        uint256 index
    );
    event PoolDeclined(address indexed leader, uint256 indexed index);
    event PoolProposed(
        uint256 indexed index,
        address indexed leader,
        address fundingTokenContract,
        uint256 softCap,
        uint256 hardCap,
        uint256 initialDeposit,
        uint128 raiseEndDate,
        uint128 terminationDate,
        uint128 votingTime,
        uint64 leaderCommission,
        uint64 couponAmount,
        uint64 quorum,
        uint64 majority,
        bool transferrable
    );


    Pool[] private proposals;

    modifier notDeployed(uint256 index) {
        require(
            proposals[index].deployable,
            "DEXLFactory: Proposal can not be deployed"
        );
        _;
    }

    function transferOwnership(
        address to
    ) public override(IDEXLFactory, Ownable) onlyOwner {
        super.transferOwnership(to);
    }

    function proposePool(
        Pool memory pool
    ) external {
        require(
            pool.softCap <= pool.hardCap,
            "DEXLFactory: softcap must be less or equal than the hardcap"
        );
        require(
            pool.raiseEndDate < pool.terminationDate,
            "DEXLFactory: raiseEndDate must be less than the terminationDate"
        );
        require(
            pool.fundingTokenContract != address(0),
            "DEXLFactory: the funding token contract's address can not be 0"
        );
        require(
            pool.couponAmount <= 10e9,
            "DEXLFactory: couponAmount value must be between 0 and 10e9"
        );
        require(
            pool.leaderCommission <= 10e9,
            "DEXLFactory: leaderCommission value must be between 0 and 10e9"
        );
        require(
            pool.couponAmount + pool.leaderCommission <= 10e9,
            "DEXLFactory: the sum of leaderCommission and couponAmount must be lower than 10e9"
        );
        require(
            pool.quorum <= 10e9,
            "DEXLFactory: quorum value must be between 0 and 10e9"
        );
        require(
            pool.majority <= 10e9,
            "DEXLFactory: majority value must be between 0 and 10e9"
        );
        IERC20(pool.fundingTokenContract).transferFrom(
            pool.leader,
            address(this),
            pool.initialDeposit
        );
        proposals.push(
            Pool({
                leader: pool.leader,
                fundingTokenContract: pool.fundingTokenContract,
                leaderCommission: pool.leaderCommission,
                softCap: pool.softCap,
                hardCap: pool.hardCap,
                raiseEndDate: uint128(block.timestamp) + pool.raiseEndDate,
                couponAmount: pool.couponAmount,
                initialDeposit: pool.initialDeposit,
                terminationDate: uint128(block.timestamp) + pool.terminationDate,
                votingTime: pool.votingTime,
                deployable: true,
                transferrable: pool.transferrable,
                quorum: pool.quorum,
                majority: pool.majority
            })
        );
        emit PoolProposed(
            proposals.length - 1,
            pool.leader,
            pool.fundingTokenContract,
            pool.softCap,
            pool.hardCap,
            pool.initialDeposit,
            pool.raiseEndDate,
            pool.terminationDate,
            pool.votingTime,
            pool.leaderCommission,
            pool.couponAmount,
            pool.quorum,
            pool.majority,
            pool.transferrable
        );
    }

    function getProposal(uint256 index) public view returns (Pool memory) {
        return proposals[index];
    }

    function approveProposal(
        uint256 index
    ) external onlyOwner notDeployed(index) returns (address) {
        address pool = address(
            new DEXLPool(
                proposals[index]
            )
        );
        IERC20(proposals[index].fundingTokenContract).transfer(
            pool,
            proposals[index].initialDeposit
        );
        proposals[index].deployable = false;
        emit PoolCreated(proposals[index].leader, pool, index);
        return pool;
    }

    function declineProposal(
        uint256 index
    ) external onlyOwner notDeployed(index) {
        proposals[index].deployable = false;
        //sendback the money to the leader
        IERC20(proposals[index].fundingTokenContract).transfer(
            proposals[index].leader,
            proposals[index].initialDeposit
        );
        emit PoolDeclined(proposals[index].leader, index);
    }
}
