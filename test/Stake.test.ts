import { expect, use } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { FanToArtistStaking, Web3MusicNativeToken } from '../typechain-types/index';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { timeMachine, parseDetailedStake, matchDetailedStakes, getStakeFromEvent, getStakeExtendedFromEvent, getStakeArtistFromEvent, getStakeIncreaseFromEvent } from './utils/utils';
import { ContractTransaction } from '@ethersproject/contracts';
import { BigNumber } from 'ethers';

const cache = {};

describe('Stake Simulation', () => {
    let Web3MusicNativeToken: Web3MusicNativeToken;
    let ftas: FanToArtistStaking;
    let owner: SignerWithAddress;
    let artists: SignerWithAddress[]; //6
    let users: SignerWithAddress[]; //13
    const defVeReward = 10;
    const defArtistReward = 10;
    const minStakeTime = 10;
    const maxStakeTime = 864000;

    beforeEach(async () => {
        const signers = await ethers.getSigners();
        owner = signers[0];
        artists = signers.slice(1, 7);
        users = signers.slice(7, 20);

        const FTAS = await ethers.getContractFactory('FanToArtistStaking');
        ftas = await FTAS.deploy();
        await ftas.deployed();

        const cWeb3MusicNativeToken = await ethers.getContractFactory('Web3MusicNativeToken');
        Web3MusicNativeToken = await cWeb3MusicNativeToken.deploy(ftas.address);
        await Web3MusicNativeToken.deployed();
        await ftas.initialize(Web3MusicNativeToken.address, defVeReward, defArtistReward, minStakeTime, maxStakeTime);

        await Promise.allSettled([artists.forEach(artist =>
            ftas.addArtist(artist.address, owner.address)
        )]);
        await Promise.allSettled([users.forEach(user =>
            Web3MusicNativeToken.mint(user.address, BigNumber.from(10).pow(20))
        )]);
    });


    it('A users should not be able to stake the same artist if already has an active stake', async () => {
        const user = users[0];
        const event = await ftas.connect(user).stake(artists[0].address, BigNumber.from(10).pow(19).mul(5), 30);
        const parsed = await getStakeFromEvent(event);

        expect(await Web3MusicNativeToken.balanceOf(ftas.address)).to.equal(BigNumber.from(10).pow(19).mul(5));

        await expect(ftas.connect(user).stake(artists[0].address, BigNumber.from(10).pow(19).mul(5), 30))
            .to.be.revertedWith('FanToArtistStaking: already staking');

        expect(await Web3MusicNativeToken.balanceOf(ftas.address)).to.equal(BigNumber.from(10).pow(19).mul(5));
        expect(await Web3MusicNativeToken.balanceOf(user.address)).to.equal(BigNumber.from(10).pow(19).mul(5));

        matchDetailedStakes(parseDetailedStake(parsed), artists[0].address, user.address, BigNumber.from(10).pow(19).mul(5), 30);
    });

    it('A users should not be able to redeem a stake before his maturation', async () => {
        const user = users[0];
        const event = await ftas.connect(user).stake(artists[0].address, BigNumber.from(10).pow(19).mul(5), 30);
        expect(await Web3MusicNativeToken.balanceOf(ftas.address)).to.equal(BigNumber.from(10).pow(19).mul(5));
        const parsed = await getStakeFromEvent(event);

        await expect(ftas.connect(user).redeem(artists[0].address, user.address, parsed.index))
            .to.be.revertedWith('FanToArtistStaking: the stake is not ended');

        await timeMachine(1);
        await ftas.connect(user).redeem(artists[0].address, user.address, parsed.index);
        expect(await Web3MusicNativeToken.balanceOf(ftas.address)).to.equal(0);

        await expect(ftas.connect(user).redeem(artists[0].address, user.address, parsed.index))
            .to.be.revertedWith('FanToArtistStaking: this stake has already been redeemed');
    });

    it('A user should be able to fetch all his stakes', async () => {
        async function StakeAndRedeem() {
            const event = await ftas.connect(user).stake(artists[0].address, BigNumber.from(10).pow(19).mul(10), 30);
            expect(await Web3MusicNativeToken.balanceOf(ftas.address)).to.equal(BigNumber.from(10).pow(19).mul(10));
            const parsed = await getStakeFromEvent(event);
            await timeMachine(1);
            await ftas.connect(user).redeem(artists[0].address, user.address, parsed.index);
            expect(await Web3MusicNativeToken.balanceOf(ftas.address)).to.equal(0);
            return parsed.index;
        }
        const user = users[0];
        const indexes = [];
        indexes.push(await StakeAndRedeem());
        indexes.push(await StakeAndRedeem());
        indexes.push(await StakeAndRedeem());
        expect(indexes.length).to.equal(3);
        await ftas.getReward(
            artists[0].address,
            indexes.map(o => user.address),
            indexes,
            indexes.map(o => 0),
            indexes.map(o => 10)
        );
        expect(await Web3MusicNativeToken.balanceOf(artists[0].address)).to.equal((BigNumber.from(10).pow(19).mul(10).mul(30).mul(3)).div(defArtistReward));
    });

    it('A user should be able to increase the amount staked', async () => {
        const user = users[0];

        const event = await ftas.connect(user).stake(artists[0].address, BigNumber.from(10).pow(19).mul(5), 30);
        expect(await Web3MusicNativeToken.balanceOf(ftas.address)).to.equal(BigNumber.from(10).pow(19).mul(5));
        expect(await Web3MusicNativeToken.balanceOf(user.address)).to.equal(BigNumber.from(10).pow(19).mul(5));
        const parsed = await getStakeFromEvent(event);
        matchDetailedStakes(parseDetailedStake(parsed), artists[0].address, user.address, BigNumber.from(10).pow(19).mul(5), 30);
        const event2 = await ftas.connect(user).increaseAmountStaked(artists[0].address, BigNumber.from(10).pow(19).mul(5));
        const parsed2 = await getStakeIncreaseFromEvent(parsed, event2);
        expect(await Web3MusicNativeToken.balanceOf(ftas.address)).to.equal(BigNumber.from(10).pow(19).mul(10));
        expect(await Web3MusicNativeToken.balanceOf(user.address)).to.equal(0);
        matchDetailedStakes(parseDetailedStake(parsed2), artists[0].address, user.address, BigNumber.from(10).pow(19).mul(10), parsed2.end - parsed2.start);
    });

    it('A user should be able to increase the time of a stake', async () => {
        const user = users[0];

        const event = await ftas.connect(user).stake(artists[0].address, BigNumber.from(10).pow(19).mul(5), 30);
        const parsed = await getStakeFromEvent(event);

        const event2 = await ftas.connect(user).extendStake(artists[0].address, 30);
        const parsed2 = await getStakeExtendedFromEvent(parsed, event2);

        matchDetailedStakes(parseDetailedStake(parsed2), artists[0].address, user.address, BigNumber.from(10).pow(19).mul(5), 60);
    });

    it('A user should not be able to increase the time of a stake if exceed the max', async () => {
        const user = users[0];

        await ftas.connect(user).stake(artists[0].address, BigNumber.from(10).pow(19).mul(5), 3000);

        await ftas.connect(user).increaseAmountStaked(artists[0].address, BigNumber.from(10).pow(19).mul(5));
        expect(await Web3MusicNativeToken.balanceOf(ftas.address)).to.equal(BigNumber.from(10).pow(19).mul(10));
        expect(await Web3MusicNativeToken.balanceOf(user.address)).to.equal(0);

        await expect(ftas.connect(user).extendStake(artists[0].address, 10e10))
            .to.be.revertedWith('FanToArtistStaking: the stake period exceed the maximum or less than minimum');
        expect(await Web3MusicNativeToken.balanceOf(ftas.address)).to.equal(BigNumber.from(10).pow(19).mul(10));
        expect(await Web3MusicNativeToken.balanceOf(user.address)).to.equal(0);

    });

    it('A user should not be able to increase the time of a stake if exceed the max', async () => {
        const user = users[0];
        const event = await ftas.connect(user).stake(artists[0].address, BigNumber.from(10).pow(19).mul(5), 30);
        const parsed = await getStakeFromEvent(event);

        await ftas.connect(user).increaseAmountStaked(artists[0].address, BigNumber.from(10).pow(19).mul(2));
        expect(await Web3MusicNativeToken.balanceOf(ftas.address)).to.equal(BigNumber.from(10).pow(19).mul(7));
        expect(await Web3MusicNativeToken.balanceOf(user.address)).to.equal(BigNumber.from(10).pow(19).mul(3));

        await ftas.connect(user).increaseAmountStaked(artists[0].address, BigNumber.from(10).pow(19).mul(2));
        expect(await Web3MusicNativeToken.balanceOf(ftas.address)).to.equal(BigNumber.from(10).pow(19).mul(9));
        expect(await Web3MusicNativeToken.balanceOf(user.address)).to.equal(BigNumber.from(10).pow(19).mul(1));

        await expect(ftas.connect(user).extendStake(artists[0].address, parsed.end))
            .to.be.revertedWith('FanToArtistStaking: the stake period exceed the maximum or less than minimum');
        expect(await Web3MusicNativeToken.balanceOf(ftas.address)).to.equal(BigNumber.from(10).pow(19).mul(9));
        expect(await Web3MusicNativeToken.balanceOf(user.address)).to.equal(BigNumber.from(10).pow(19).mul(1));
    });

    it('A user should be able to change the artist staked', async () => {
        const user = users[0];

        const event = await ftas.connect(user).stake(artists[0].address, BigNumber.from(10).pow(19).mul(5), 3000);
        const parsed = await getStakeFromEvent(event);

        await timeMachine(5);

        const event2 = await ftas.connect(user).changeArtistStaked(artists[0].address, artists[1].address);
        const parsed2 = await getStakeArtistFromEvent(parsed, event2);
        expect(await Web3MusicNativeToken.balanceOf(ftas.address)).to.equal(BigNumber.from(10).pow(19).mul(5));
        expect(await Web3MusicNativeToken.balanceOf(user.address)).to.equal(BigNumber.from(10).pow(19).mul(5));

        const stake0 = parsed;
        const stake1 = parsed2;
        expect(stake0).to.not.be.undefined;
        expect(stake1).to.not.be.undefined;
        expect(stake0.amount).to.equal(stake1.amount);
    });

    it('An artist should be able to get the reward until his removal', async () => {
        const user = users[0];
        const artist = artists[0];

        const event = await ftas.connect(user).stake(artist.address, BigNumber.from(10).pow(19).mul(5), 600);
        const parsed = await getStakeFromEvent(event);


        await timeMachine(5);
        await ftas.removeArtist(artist.address, owner.address);

        await ftas.getReward(
            artists[0].address,
            [user.address],
            [parsed.index],
            [0],
            [10]
        );
        expect(await Web3MusicNativeToken.balanceOf(artists[0].address)).to.be.closeTo(BigNumber.from(10).pow(18).mul(600 * 50 / defArtistReward).div(2), 5000000000000000000n);
    });

    it('A user should not be able to change the artist staked when doesnt meet the requirements', async () => {
        const user = users[0];

        await ftas.connect(user).stake(artists[0].address, BigNumber.from(10).pow(19).mul(5), 3000);

        await expect(ftas.connect(user).changeArtistStaked(artists[1].address, users[0].address))
            .to.be.revertedWith('FanToArtistStaking: the artist is not a verified artist');
        await expect(ftas.connect(user).changeArtistStaked(artists[0].address, artists[0].address))
            .to.be.revertedWith('FanToArtistStaking: the new artist is the same as the old one');

        await ftas.connect(user).stake(artists[1].address, BigNumber.from(10).pow(19).mul(5), 20);
        await expect(ftas.connect(user).changeArtistStaked(artists[0].address, artists[1].address))
            .to.be.revertedWith('FanToArtistStaking: already staking the new artist');
    });

    describe('Reward calculation', () => {
        it('Should get no reward if there is no staking', async () => {
            await expect(ftas.connect(artists[0]).getReward(artists[0].address, [users[0].address], [0], [0], [2]))
                .to.be.revertedWith('FanToArtistStaking: no stake found with this index');
            expect(await Web3MusicNativeToken.balanceOf(artists[0].address)).to.equal(0);
        });

        it('Should get the only his reward and not twice', async () => {
            const user0 = users[0];
            const user1 = users[1];
            const artist1 = artists[1];
            const artist2 = artists[2];

            await ftas.connect(user0).stake(artist1.address, BigNumber.from(10).pow(19).mul(10), 60);
            await timeMachine(10);
            await ftas.connect(artist1).getReward(artist1.address, [user0.address], [0], [0], [10]);
            expect(await Web3MusicNativeToken.balanceOf(artist1.address)).to.equal(BigNumber.from(10).pow(19).mul(60));
            await ftas.changeArtistRewardRate(20, owner.address);

            await ftas.connect(user1).stake(artist2.address, BigNumber.from(10).pow(19).mul(10), 60);
            await timeMachine(10);
            await ftas.connect(artist2).getReward(artist2.address, [user1.address], [0], [1], [10]);
            expect(await Web3MusicNativeToken.balanceOf(artist2.address)).to.equal(BigNumber.from(10).pow(19).mul(30));

            // await timeMachine(10);
            // await expect(ftas.connect(artist1).getReward(artist1.address, [user0.address], [0], [0], [10])).to.be.revertedWith('FanToArtistStaking: a stake was already redeemed completely');
            // expect(await Web3MusicNativeToken.balanceOf(artist1.address)).to.equal(600);
            // await expect(ftas.connect(artist2).getReward(artist2.address, [user1.address], [0], [0], [10])).to.be.revertedWith('FanToArtistStaking: a stake was already redeemed completely');
            // expect(await Web3MusicNativeToken.balanceOf(artist2.address)).to.equal(300);
        });

        it('Should get the same value if the rate is the same but in 2 different timeframes', async () => {
            const user0 = users[0];
            const user1 = users[1];
            const artist1 = artists[1];
            const artist2 = artists[2];

            await ftas.connect(user1).stake(artist2.address, BigNumber.from(10).pow(19).mul(10), 600);
            await timeMachine(11);
            await ftas.connect(artist2).getReward(artist2.address, [user1.address], [0], [0], [10]);
            await ftas.connect(user0).stake(artist1.address, BigNumber.from(10).pow(19).mul(10), 600);
            await timeMachine(5);
            await ftas.changeArtistRewardRate(defArtistReward, owner.address);
            await timeMachine(6);
            await ftas.connect(artist1).getReward(artist1.address, [user0.address], [0], [0], [10]);

            expect(await Web3MusicNativeToken.balanceOf(artist2.address)).to.equal(await Web3MusicNativeToken.balanceOf(artist1.address));
        });

        it('Should get the same value if the rate is the same but in 3 different timeframes', async () => {
            const user0 = users[0];
            const user1 = users[1];
            const artist1 = artists[1];
            const artist2 = artists[2];

            await ftas.connect(user1).stake(artist2.address, BigNumber.from(10).pow(19).mul(10), 600);
            await timeMachine(11);
            await ftas.connect(artist2).getReward(artist2.address, [user1.address], [0], [0], [10]);
            await ftas.connect(user0).stake(artist1.address, BigNumber.from(10).pow(19).mul(10), 900);
            await timeMachine(5);
            await ftas.changeArtistRewardRate(1000000, owner.address);
            await timeMachine(5);
            await ftas.changeArtistRewardRate(defArtistReward, owner.address);
            await timeMachine(6);
            await ftas.connect(artist1).getReward(artist1.address, [user0.address], [0], [0], [10]);

            expect(await Web3MusicNativeToken.balanceOf(artist2.address)).to.closeTo(await Web3MusicNativeToken.balanceOf(artist1.address), BigNumber.from(10).pow(19).mul(2));
        });

        it('Should get half the value if the rate changes halfway', async () => {
            const user0 = users[0];
            const user1 = users[1];
            const artist1 = artists[1];
            const artist2 = artists[2];

            await ftas.connect(user1).stake(artist2.address, BigNumber.from(10).pow(19).mul(10), 600);
            await timeMachine(11);
            await ftas.connect(artist2).getReward(artist2.address, [user1.address], [0], [0], [10]);
            await ftas.connect(user0).stake(artist1.address, BigNumber.from(10).pow(19).mul(10), 600);
            await timeMachine(5);
            await ftas.changeArtistRewardRate(10000, owner.address);
            await timeMachine(6);
            await ftas.changeArtistRewardRate(10, owner.address);

            await ftas.connect(artist1).getReward(artist1.address, [user0.address], [0], [0], [10]);
            expect(BigNumber.from(await Web3MusicNativeToken.balanceOf(artist2.address)).div(2)).to.closeTo(await Web3MusicNativeToken.balanceOf(artist1.address), BigNumber.from(10).pow(19).mul(2)); //safe?
        });

        it('An artist should be able to get his reward', async () => {
            const user0 = users[0];
            const user1 = users[1];
            const user2 = users[2];
            const artist0 = artists[0];

            await Web3MusicNativeToken.mint(user0.address, BigNumber.from(10).pow(19).mul(10));
            await ftas.changeArtistRewardRate(1, owner.address);
            await ftas.connect(user0).stake(artist0.address, BigNumber.from(10).pow(19).mul(10), 100);
            await timeMachine(4);
            await ftas.connect(artist0).getReward(artist0.address, [user0.address], [0], [1], [10]);
            expect(
              await Web3MusicNativeToken.balanceOf(artist0.address)
            ).to.equal(BigNumber.from(10).pow(19).mul(10).mul(100));
            await ftas.connect(user1).stake(artist0.address, BigNumber.from(10).pow(19).mul(5), 100);
            await timeMachine(4);

            await ftas.connect(artist0).getReward(artist0.address, [user1.address], [0], [1], [10]);
            const balancePrev = await Web3MusicNativeToken.balanceOf(artist0.address);
            expect(balancePrev).to.equal(
              BigNumber.from(10)
                .pow(18)
                .mul((100 * 100 / 1) + (50 * 100 / 1))
            );

            await ftas.connect(user2).stake(artist0.address, BigNumber.from(10).pow(19).mul(5), 10000);
            await timeMachine(5);
            await ftas.connect(artist0).getReward(artist0.address, [user2.address], [0], [1], [10]);
            const balanceMiddle = await Web3MusicNativeToken.balanceOf(artist0.address);
            await timeMachine(5);
            await ftas.connect(artist0).getReward(artist0.address, [user2.address], [0], [1], [10]);
            expect(balanceMiddle).to.be.greaterThan(balancePrev);
            expect(await Web3MusicNativeToken.balanceOf(artist0.address)).to.greaterThan(balanceMiddle);
        });

        it('An artist should get no reward if already redeemed it', async () => {
            const user0 = users[0];
            const artist0 = artists[0];

            await Web3MusicNativeToken.mint(user0.address,  BigNumber.from(10).pow(19).mul(10));
            await ftas.changeArtistRewardRate(1, owner.address);
            await ftas.connect(user0).stake(artist0.address,  BigNumber.from(10).pow(19).mul(10), 600); //staking 100 for 10 minutes
            await timeMachine(15);

            await ftas.connect(artist0).getReward(artist0.address, [user0.address], [0], [1], [10]);
            expect(
              await Web3MusicNativeToken.balanceOf(artist0.address)
            ).to.be.equal(
              BigNumber.from(10)
                .pow(18)
                .mul((100 * 600) / 1)
            ); //amount * seconds / artistRate
            await timeMachine(15);
            await ftas.changeArtistRewardRate(10, owner.address);
            await timeMachine(5);

            await expect(ftas.connect(artist0).getReward(artist0.address, [user0.address], [0], [2], [10]))
                .to.be.revertedWith("FanToArtistStaking: a stake was already redeemed completely");
            await timeMachine(5);

            expect(
              await Web3MusicNativeToken.balanceOf(artist0.address)
            ).to.be.equal(
              BigNumber.from(10)
                .pow(18)
                .mul((100 * 600) / 1)
            ); //amount * seconds / artistRate
            await ftas.changeArtistRewardRate(1, owner.address);
            await timeMachine(5);

            await ftas.connect(user0).stake(artist0.address, BigNumber.from(10).pow(19).mul(10), 600); //staking 100 for 10 minutes
            await timeMachine(15);
            await ftas
              .connect(artist0)
              .getReward(artist0.address, [user0.address], [1], [3], [10]);
            expect(
              await Web3MusicNativeToken.balanceOf(artist0.address)
            ).to.be.equal(
              BigNumber.from(10)
                .pow(18)
                .mul((100 * 600) / 1)
                .mul(2)
            ); //amount * seconds / artistRate
        });
    });

    describe('Stress Batch', () => {
        it('All users should be able to stake the same artist', async () => {
            for await (const user of users)
                await ftas.connect(user).stake(artists[0].address, BigNumber.from(10).pow(19).mul(10), 30)

            expect(await Web3MusicNativeToken.balanceOf(ftas.address)).to.equal( BigNumber.from(10).pow(19).mul(10).mul(13));

            await timeMachine(1);

            for await (const user of users)
                await ftas.connect(user).redeem(artists[0].address, user.address, 0);


            expect(await Web3MusicNativeToken.balanceOf(ftas.address)).to.equal(0);
        });

        it('All users should be able to stake all artists at the same time', async () => {
            const promises: Promise<ContractTransaction>[] = [];
            artists.forEach(artist =>
                users.forEach(user =>
                    promises.push(ftas.connect(user).stake(artist.address,  BigNumber.from(10).pow(19), 30)))
            );
            await Promise.all(promises);
            expect(await Web3MusicNativeToken.balanceOf(ftas.address)).to.equal(
              BigNumber.from(10)
                .pow(18)
                .mul(10 * users.length * artists.length)
            );

            await timeMachine(1);

            for await (const user of users)
                for (let i = 0; i < artists.length; i++)
                    await ftas.connect(user).redeem(artists[i].address, user.address, 0);


            expect(await Web3MusicNativeToken.balanceOf(ftas.address)).to.equal(0);
        });
    });
});