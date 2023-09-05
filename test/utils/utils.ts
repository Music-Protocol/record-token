import { ethers } from 'hardhat';
import { FanToArtistStaking, DEXLFactory } from '../../typechain-types/index';
import { expect } from 'chai';
import { ContractTransaction } from '@ethersproject/contracts';
import { string } from 'hardhat/internal/core/params/argumentTypes';
import { BigNumber } from 'ethers';

async function timeMachine(minutes: number) {
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    await ethers.provider.send('evm_mine', [(60 * minutes) + blockBefore.timestamp]);
}

function parseDetailedStake(element: any) {
    return {
        artist: element.artist,
        user: element.sender,
        amount: element.amount,
        duration: element.end - element.start
    }
};

function parseDatesStakes(elements: any[]) {
    return elements.map(o => {
        return {
            amount: o.stake.amount.toNumber(),
            start: o.stake.start,
            end: o.stake.end
        };
    });
}

function matchDetailedStakes(element: any, artist: string, user: string, amount: any, time: any) {
    expect(element.artist).to.equal(artist);
    expect(element.user).to.equal(user);
    expect(element.amount).to.equal(amount);
    expect(element.duration).to.equal(time);
}

const matchPool = (response: DEXLFactory.PoolStructOutput, source: any) => {
    expect(response.leader).to.equal(source.leader);
    expect(response.fundingTokenContract).to.equal(source.fundingTokenContract);
    expect(response.leaderCommission).to.equal(source.leaderCommission);
    expect(response.softCap).to.equal(source.softCap);
    expect(response.hardCap).to.equal(source.hardCap);
    expect(response.couponAmount).to.equal(source.couponAmount);
    expect(response.initialDeposit).to.equal(source.initialDeposit);
    expect(response.deployable).to.equal(source.deployable);
    expect(Number(response.terminationDate) - Number(response.raiseEndDate)).to.equal(source.terminationDate - source.raiseEndDate);
}

async function getTimestamp() {
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    return blockBefore.timestamp;
}

async function getStakeFromEvent(receipt: ContractTransaction) {
    const args = (await receipt.wait()).events?.find(e => e.event == 'StakeCreated')?.args;
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    return {
        artist: args?.artist,
        sender: args?.sender,
        amount: args?.amount,
        end: args?.end,
        start: blockBefore.timestamp,
        index: args?.index.toNumber()
    }
}

async function getStakeIncreaseFromEvent(previous: any, receipt: ContractTransaction) {
    const args = (await receipt.wait()).events?.find(e => e.event == 'StakeIncreased')?.args;
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    return {
        artist: args?.artist,
        sender: args?.sender,
        amount: BigNumber.from(previous?.amount).add(args?.amount),
        end: previous?.end,
        start: blockBefore.timestamp,
        index: args?.newIndex.toNumber()
    }
}

async function getStakeArtistFromEvent(previous: any, receipt: ContractTransaction) {
    const args = (await receipt.wait()).events?.find(e => e.event == 'StakeChangedArtist')?.args;
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    return {
        artist: args?.artist,
        sender: args?.sender,
        amount: previous?.amount,
        end: args?.end,
        start: blockBefore.timestamp,
        index: args?.index
    }
}

async function getStakeExtendedFromEvent(previous: any, receipt: ContractTransaction) {
    const args = (await receipt.wait()).events?.find(e => e.event == 'StakeEndChanged')?.args;
    return {
        artist: previous?.artist,
        sender: previous?.sender,
        amount: previous?.amount,
        end: args?.end,
        start: previous?.start,
        index: previous?.index
    }
}

async function getPoolFromEvent(receipt: ContractTransaction) {
    return (await receipt.wait()).events?.find(e => e.event == 'PoolCreated')?.args?.pool;
}
async function getIndexFromProposal(receipt: ContractTransaction) {
    return (await receipt.wait()).events?.find(e => e.event == 'PoolProposed')?.args?.index;
}

async function getProposalHash(receipt: ContractTransaction) {
    return (await receipt.wait()).events!.filter(e => ['ReferendumProposed', 'EarlyClosureProposed', 'FundingProposed'].includes(e.event!)).at(0)!.args!.hash;
}

function calcPoolRevenues(input: number, leaderFee: number, couponFee: number) {
    const leader = (input * leaderFee) / 10e8;
    const shareholders = (input * couponFee) / 10e8;
    return {
        pool: (input - leader) - shareholders,
        leader,
        shareholders,
    }
}

export {
    timeMachine,
    parseDetailedStake,
    matchDetailedStakes,
    matchPool,
    getTimestamp,
    getPoolFromEvent,
    getProposalHash,
    parseDatesStakes,
    calcPoolRevenues,
    getIndexFromProposal,
    getStakeFromEvent,
    getStakeExtendedFromEvent,
    getStakeIncreaseFromEvent,
    getStakeArtistFromEvent
};