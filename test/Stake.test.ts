import { expect, use } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { FanToArtistStaking, Web3MusicNativeToken } from '../typechain-types/index';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { timeMachine, parseDetailedStake, matchDetailedStakes, getStakeFromEvent, getStakeExtendedFromEvent, getStakeArtistFromEvent, getStakeIncreaseFromEvent } from './utils/utils';
import { ContractTransaction } from '@ethersproject/contracts';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { BigNumber, BigNumberish } from 'ethers';

const cache = {};

describe('Stake Simulation', () => {
    let Web3MusicNativeToken: Web3MusicNativeToken;
    let ftas: FanToArtistStaking;
    let owner: SignerWithAddress;
    let artists: SignerWithAddress[]; //6
    let users: SignerWithAddress[]; //13
    const defVeReward = 10;
    let defArtistReward = 10e8;
    let artistRewardPerc = (defArtistReward / 10e9);
    const minStakeTime = 10;
    const maxStakeTime = 864000;

    const stakeAndRedeem = async (user: SignerWithAddress, artist: SignerWithAddress, amount: BigNumberish, time: BigNumberish) => {
        await ftas.connect(user).stake(artist.address, amount, time);
        await timeMachine(Number(time) / 60);
        await ftas.connect(user).redeem(artist.address, user.address);
    };

    const expectedRedeem = (amount: any, time: any, reward: any) => {
        return (amount * time) * reward;
    };
    beforeEach(async () => {
        const signers = await ethers.getSigners();
        owner = signers[0];
        artists = signers.slice(1, 7);
        users = signers.slice(7, 20);

        const FTAS = await ethers.getContractFactory('FanToArtistStaking');
        ftas = await FTAS.deploy();
        await ftas.deployed();

        const cWeb3MusicNativeToken = await ethers.getContractFactory('Web3MusicNativeToken');
        Web3MusicNativeToken = await cWeb3MusicNativeToken.deploy(ftas.address, ftas.address);
        await Web3MusicNativeToken.deployed();
        await ftas.initialize(Web3MusicNativeToken.address, owner.address, defVeReward, defArtistReward, minStakeTime, maxStakeTime, 3);

        await Promise.allSettled([artists.forEach(artist =>
            ftas.addArtist(artist.address, owner.address)
        )]);
        await Promise.allSettled([users.forEach(user =>
            Web3MusicNativeToken.mint(user.address, 100000)
        )]);
    });

    describe('staking settled', () => {
        it('Should let a stake happen', async () => {
            await stakeAndRedeem(users[0], artists[0], 100000, 120);
            await ftas.getReward(artists[0].address);
            expect(await Web3MusicNativeToken.balanceOf(artists[0].address)).to.equal(expectedRedeem(100000, 120 + 1, artistRewardPerc));
        });

        it('Redeem time should not change the amount redeemed', async () => {
            await stakeAndRedeem(users[0], artists[0], 100000, 120);
            await stakeAndRedeem(users[0], artists[0], 100000, 120);
            await ftas.getReward(artists[0].address);

            await stakeAndRedeem(users[1], artists[1], 100000, 120);
            await ftas.getReward(artists[1].address);
            await stakeAndRedeem(users[1], artists[1], 100000, 120);
            await ftas.getReward(artists[1].address);

            expect(await Web3MusicNativeToken.balanceOf(artists[0].address)).to.equal(expectedRedeem(100000, 120 + 1, artistRewardPerc) * 2);
            expect(await Web3MusicNativeToken.balanceOf(artists[1].address)).to.equal(expectedRedeem(100000, 120 + 1, artistRewardPerc) * 2);
        });

        it('The redeem should not change even with interleaving', async () => {
            await ftas.connect(users[0]).stake(artists[0].address, 100, 600); // 10 minutes for s1
            await timeMachine(5); // we let 5 min pass, half s1
            await ftas.connect(users[1]).stake(artists[0].address, 100, 600); // 10 minutes for s2
            await timeMachine(5); // we let 5 min pass, full s1 and half2
            await ftas.redeem(artists[0].address, users[0].address); // redeem s1
            await timeMachine(5); // we let 5 min pass, full s2
            await ftas.redeem(artists[0].address, users[1].address); // redeem s2

            await ftas.getReward(artists[0].address);
            expect(await Web3MusicNativeToken.balanceOf(artists[0].address)).to.equal(expectedRedeem(100, 600 + 2, artistRewardPerc) * 2);
        });

        it('The redeem should not change even with 2 different reward rates', async () => {
            await ftas.connect(users[0]).stake(artists[0].address, 100, 600); // 10 minutes for s1
            await timeMachine(5); // we let 5 min pass, half s1
            await ftas.changeArtistRewardRate(3 * 10e8, users[0].address);
            await timeMachine(5); // we let 5 min pass, full s1 and half2
            await ftas.redeem(artists[0].address, users[0].address); // redeem s1

            await ftas.getReward(artists[0].address);
            expect(await Web3MusicNativeToken.balanceOf(artists[0].address)).to.equal(expectedRedeem(100, 600 + 2, artistRewardPerc) * 2);
        });

        it('The redeem should not change even with 3 different reward rates', async () => {
            await ftas.connect(users[0]).stake(artists[0].address, 100, 900); // 10 minutes for s1
            await timeMachine(5); // we let 5 min pass, 1/3 s1
            await ftas.changeArtistRewardRate(3 * 10e8, users[0].address);
            await timeMachine(5); // we let 5 min pass, 2/3 s1
            await ftas.changeArtistRewardRate(20e8, users[0].address);
            await timeMachine(5); // we let 5 min pass, full s1
            await ftas.redeem(artists[0].address, users[0].address); // redeem s1

            await ftas.getReward(artists[0].address);
            expect(await Web3MusicNativeToken.balanceOf(artists[0].address)).to.equal(expectedRedeem(100, 600 + 2, artistRewardPerc) * 3);
        });
    });

    // describe.only('staking', () => {

    // });
});

