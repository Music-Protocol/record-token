import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ArtistStaking, MusicProtocolRECORDToken } from '../typechain-types/index';
import { timeMachine } from './utils/utils';
import { BigNumberish } from 'ethers';

describe('Stake Simulation', () => {
    let MusicProtocolRECORDToken: MusicProtocolRECORDToken;
    let ftas: ArtistStaking;
    let owner: SignerWithAddress;
    let artists: SignerWithAddress[]; //6
    let users: SignerWithAddress[]; //13
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

        const FTAS = await ethers.getContractFactory('ArtistStaking');
        ftas = await upgrades.deployProxy(FTAS.connect(owner), [], { initializer: false, kind: 'uups', timeout: 180000 }) as unknown as ArtistStaking;
        await ftas.deployed();

        const cMusicProtocolRECORDToken = await ethers.getContractFactory('MusicProtocolRECORDToken');
        MusicProtocolRECORDToken = await cMusicProtocolRECORDToken.deploy(ftas.address);
        await MusicProtocolRECORDToken.deployed();
        await ftas.initialize(MusicProtocolRECORDToken.address, defArtistReward, minStakeTime, maxStakeTime, 3, 600);

        await Promise.allSettled([artists.forEach(artist =>
            ftas.addArtist(artist.address, owner.address)
        )]);
        await Promise.allSettled([users.forEach(user =>
            MusicProtocolRECORDToken.mint(user.address, 100000)
        )]);
    });

    describe('staking settled', () => {
        it('Should let a stake happen', async () => {
            await expect(MusicProtocolRECORDToken.connect(users[0]).approve(ftas.address, 100000));
            await stakeAndRedeem(users[0], artists[0], 100000, 120);
            await ftas.getReward(artists[0].address);
            expect(await MusicProtocolRECORDToken.balanceOf(artists[0].address)).to.equal(expectedRedeem(100000, 120 + 1, artistRewardPerc));
        });

        it('Redeem time should not change the amount redeemed', async () => {
            await expect(MusicProtocolRECORDToken.connect(users[0]).approve(ftas.address, 100000));
            await stakeAndRedeem(users[0], artists[0], 100000, 120);
            await expect(MusicProtocolRECORDToken.connect(users[0]).approve(ftas.address, 100000));
            await stakeAndRedeem(users[0], artists[0], 100000, 120);
            await ftas.getReward(artists[0].address);

            await expect(MusicProtocolRECORDToken.connect(users[1]).approve(ftas.address, 100000));
            await stakeAndRedeem(users[1], artists[1], 100000, 120);
            await ftas.getReward(artists[1].address);
            await expect(MusicProtocolRECORDToken.connect(users[1]).approve(ftas.address, 100000));
            await stakeAndRedeem(users[1], artists[1], 100000, 120);
            await ftas.getReward(artists[1].address);

            expect(await MusicProtocolRECORDToken.balanceOf(artists[0].address)).to.equal(expectedRedeem(100000, 120 + 1, artistRewardPerc) * 2);
            expect(await MusicProtocolRECORDToken.balanceOf(artists[1].address)).to.equal(expectedRedeem(100000, 120 + 1, artistRewardPerc) * 2);
        });

        it('The redeem should not change even with interleaving', async () => {
            await expect(MusicProtocolRECORDToken.connect(users[0]).approve(ftas.address, 100));
            await ftas.connect(users[0]).stake(artists[0].address, 100, 600); // 10 minutes for s1
            await timeMachine(5); // we let 5 min pass, half s1
            await expect(MusicProtocolRECORDToken.connect(users[1]).approve(ftas.address, 100));
            await ftas.connect(users[1]).stake(artists[0].address, 100, 600); // 10 minutes for s2
            await timeMachine(5); // we let 5 min pass, full s1 and half2
            await ftas.redeem(artists[0].address, users[0].address); // redeem s1
            await timeMachine(5); // we let 5 min pass, full s2
            await ftas.redeem(artists[0].address, users[1].address); // redeem s2

            await ftas.getReward(artists[0].address);
            expect(await MusicProtocolRECORDToken.balanceOf(artists[0].address)).to.equal(expectedRedeem(100, 600 + 2.5, artistRewardPerc) * 2);
        });

        it('The redeem should not change even with 2 different reward rates', async () => {
            await MusicProtocolRECORDToken.connect(users[0]).approve(ftas.address, 100);
            await ftas.connect(users[0]).stake(artists[0].address, 100, 1200); // 20 minutes for s1
            await timeMachine(10); // we let 10 min pass, half s1
            await expect(ftas.changeArtistRewardRate(3 * 10e8, users[0].address)).emit(ftas, "ArtistMusicProtocolRECORDTokenRewardChanged");
            await timeMachine(10); // we let 5 min pass, full s1 and half2
            await ftas.redeem(artists[0].address, users[0].address); // redeem s1

            await ftas.getReward(artists[0].address);
            expect(await MusicProtocolRECORDToken.balanceOf(artists[0].address)).to.equal(expectedRedeem(100, 600 + 1, artistRewardPerc) + expectedRedeem(100, 600 + 1, 3 * 10e8 / 10e9));
        });

        it('The redeem should not change even with 3 different reward rates', async () => {
            await expect(MusicProtocolRECORDToken.connect(users[0]).approve(ftas.address, 100));
            await ftas.connect(users[0]).stake(artists[0].address, 100, 1800); // 30 minutes for s1
            await timeMachine(10); // we let 10 min pass, 1/3 s1
            await expect(ftas.changeArtistRewardRate(3 * 10e8, users[0].address)).emit(ftas, "ArtistMusicProtocolRECORDTokenRewardChanged");
            await timeMachine(10); // we let 10 min pass, 2/3 s1
            await expect(ftas.changeArtistRewardRate(20e8, users[0].address)).emit(ftas, "ArtistMusicProtocolRECORDTokenRewardChanged");
            await timeMachine(10); // we let 10 min pass, full s1
            await ftas.redeem(artists[0].address, users[0].address); // redeem s1

            await ftas.getReward(artists[0].address);
            expect(await MusicProtocolRECORDToken.balanceOf(artists[0].address)).to.equal(expectedRedeem(100, 600 + 1, artistRewardPerc) + expectedRedeem(100, 600 + 1, 3 * 10e8 / 10e9) + expectedRedeem(100, 600 + 1, 2 * 10e8 / 10e9));
        });
    });
});

