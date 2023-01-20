import { ethers } from 'hardhat';
import { FanToArtistStaking } from '../../typechain-types/index';
import { expect } from 'chai';

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
            rewardArtist: o.stake.rewardArtist.toNumber(),
            redeemed: o.stake.redeemed
        };
    });
}

function matchDetailedStakes(element: any, artist: string, user: string, amount: number, time: any, rewardArtist: number, redeemed: boolean) {
    expect(element.artist).to.equal(artist);
    expect(element.user).to.equal(user);
    expect(element.amount).to.equal(amount);
    expect(element.duration).to.equal(time);
    expect(element.rewardArtist).to.equal(rewardArtist);
    expect(element.redeemed).to.equal(redeemed);
}

async function getTimestamp() {
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    return blockBefore.timestamp;
}

export {
    timeMachine,
    parseDetailedStakes,
    matchDetailedStakes,
    getTimestamp
};