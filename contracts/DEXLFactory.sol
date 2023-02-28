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
        Pool pool,
        string description
    );

    mapping(uint256 => Pool) private proposals;

    function transferOwnership(
        address to
    ) public override(IDEXLFactory, Ownable) onlyOwner {
        super.transferOwnership(to);
    }

    function proposePool(Pool memory pool, string memory description) external {
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
        uint256 hashProp = uint256(keccak256(abi.encode(msg.sender, pool, block.timestamp)));
        proposals[hashProp] = Pool({
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
            transferrable: pool.transferrable,
            quorum: pool.quorum,
            majority: pool.majority
        });
        emit PoolProposed(
            hashProp,
            pool,
            description
        );
    }

    function getProposal(uint256 index) public view returns (Pool memory) {
        return proposals[index];
    }

    function approveProposal(
        uint256 index
    ) external onlyOwner returns (address) {
        require(proposals[index].leader != address(0),"DEXLFactory: Proposal can not be deployed");
        address pool = address(new DEXLPool(proposals[index], _msgSender()));
        IERC20(proposals[index].fundingTokenContract).transfer(
            pool,
            proposals[index].initialDeposit
        );
        emit PoolCreated(proposals[index].leader, pool, index);
        delete proposals[index];
        return pool;
    }

    function declineProposal(uint256 index) external onlyOwner {
        //sendback the money to the leader
        require(proposals[index].leader != address(0),"DEXLFactory: Proposal can not be deployed");

        IERC20(proposals[index].fundingTokenContract).transfer(
            proposals[index].leader,
            proposals[index].initialDeposit
        );
        delete proposals[index];
        emit PoolDeclined(proposals[index].leader, index);
    }
}
