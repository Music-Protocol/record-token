import { ethers } from 'hardhat';
import { FanToArtistStaking, DEXLFactory } from '../../typechain-types/index';
import { expect } from 'chai';
import { ContractTransaction } from '@ethersproject/contracts';
import { string } from 'hardhat/internal/core/params/argumentTypes';

async function timeMachine(minutes: number) {
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    await ethers.provider.send('evm_mine', [(60 * minutes) + blockBefore.timestamp]);
}

function parseDetailedStakes(elements: FanToArtistStaking.DetailedStakeStructOutput[]) {
    return elements.map(o => {
        return {
            artist: o.artist,
            user: o.user,
            amount: o.stake.amount.toNumber(),
            duration: o.stake.end.toNumber() - o.stake.start.toNumber(),
            redeemed: o.stake.redeemed
        };
    });
}

function matchDetailedStakes(element: any, artist: string, user: string, amount: number, time: any, redeemed: boolean) {
    expect(element.artist).to.equal(artist);
    expect(element.user).to.equal(user);
    expect(element.amount).to.equal(amount);
    expect(element.duration).to.equal(time);
    expect(element.redeemed).to.equal(redeemed);
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

async function getPoolFromEvent(receipt: ContractTransaction) {
    return (await receipt.wait()).events?.filter(e => e.event == 'PoolCreated').at(0)?.args?.pool;
}

async function getProposalHash(receipt: ContractTransaction) {
    return (await receipt.wait()).events!.filter(e => ['ReferendumProposed', 'EarlyClosureProposed','FoundingProposed'].includes(e.event!)).at(0)!.args!.hash;
}

function calcPoolRevenues(input: number, leaderFee: number, couponFee: number) {
    const leader = (input * leaderFee) / 10e9;
    const shareholders = (input * couponFee) / 10e9;
    return {
        pool: (input - leader) - shareholders,
        leader,
        shareholders,
    }
}

export {
    timeMachine,
    parseDetailedStakes,
    matchDetailedStakes,
    matchPool,
    getTimestamp,
    getPoolFromEvent,
    getProposalHash,
    calcPoolRevenues
};