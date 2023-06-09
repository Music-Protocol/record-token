import { expect, use } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { FanToArtistStaking, JTP } from '../typechain-types/index';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { timeMachine, parseDetailedStake, matchDetailedStakes, getStakeFromEvent, getStakeExtendedFromEvent } from './utils/utils';
import { ContractTransaction } from '@ethersproject/contracts';

const cache = {};

describe('Stake Simulation', () => {
    let jtp: JTP;
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

        const cJTP = await ethers.getContractFactory('JTP');
        jtp = await cJTP.deploy(ftas.address, ftas.address);
        await jtp.deployed();
        await ftas.initialize(jtp.address, owner.address, defVeReward, defArtistReward, minStakeTime, maxStakeTime);

        await Promise.allSettled([artists.forEach(artist =>
            ftas.addArtist(artist.address, owner.address)
        )]);
        await Promise.allSettled([users.forEach(user =>
            jtp.mint(user.address, 100)
        )]);
    });


    it('A users should not be able to stake the same artist if already has an active stake', async () => {
        const user = users[0];
        const event = await ftas.connect(user).stake(artists[0].address, 50, 30);
        const parsed = await getStakeFromEvent(event);

        expect(await jtp.balanceOf(ftas.address)).to.equal(50);

        await expect(ftas.connect(user).stake(artists[0].address, 50, 30))
            .to.be.revertedWith('FanToArtistStaking: already staking');

        expect(await jtp.balanceOf(ftas.address)).to.equal(50);
        expect(await jtp.balanceOf(user.address)).to.equal(50);

        matchDetailedStakes(parseDetailedStake(parsed), artists[0].address, user.address, 50, 30);
    });

    it('A users should not be able to redeem a stake before his maturation', async () => {
        const user = users[0];
        const event = await ftas.connect(user).stake(artists[0].address, 50, 30);
        expect(await jtp.balanceOf(ftas.address)).to.equal(50);
        const parsed = await getStakeFromEvent(event);

        await expect(ftas.connect(user).redeem(artists[0].address, user.address, parsed.index))
            .to.be.revertedWith('FanToArtistStaking: the stake is not ended');

        await timeMachine(1);
        await ftas.connect(user).redeem(artists[0].address, user.address, parsed.index);
        expect(await jtp.balanceOf(ftas.address)).to.equal(0);

        await expect(ftas.connect(user).redeem(artists[0].address, user.address, parsed.index))
            .to.be.revertedWith('FanToArtistStaking: this stake has already been redeemed');
    });

    it('A user should be able to fetch all his stakes', async () => {
        async function StakeAndRedeem() {
            const event = await ftas.connect(user).stake(artists[0].address, 100, 30);
            expect(await jtp.balanceOf(ftas.address)).to.equal(100);
            const parsed = await getStakeFromEvent(event);
            await timeMachine(1);
            await ftas.connect(user).redeem(artists[0].address, user.address, parsed.index);
            expect(await jtp.balanceOf(ftas.address)).to.equal(0);
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
        expect(await jtp.balanceOf(artists[0].address)).to.equal((100 * 30 * 3) / defArtistReward);
    });

    it('A user should be able to increase the amount staked', async () => {
        const user = users[0];

        const event = await ftas.connect(user).stake(artists[0].address, 50, 30);
        expect(await jtp.balanceOf(ftas.address)).to.equal(50);
        expect(await jtp.balanceOf(user.address)).to.equal(50);
        const parsed = await getStakeFromEvent(event);
        matchDetailedStakes(parseDetailedStake(parsed), artists[0].address, user.address, 50, 30);

        const event2 = await ftas.connect(user).increaseAmountStaked(artists[0].address, 50);
        const parsed2 = await getStakeFromEvent(event2);
        expect(await jtp.balanceOf(ftas.address)).to.equal(100);
        expect(await jtp.balanceOf(user.address)).to.equal(0);
        matchDetailedStakes(parseDetailedStake(parsed2), artists[0].address, user.address, 100, parsed2.end - parsed2.start);
    });

    it('A user should be able to increase the time of a stake', async () => {
        const user = users[0];

        const event = await ftas.connect(user).stake(artists[0].address, 50, 30);
        const parsed = await getStakeFromEvent(event);

        const event2 = await ftas.connect(user).extendStake(artists[0].address, 30);
        const parsed2 = await getStakeExtendedFromEvent(parsed, event2);

        matchDetailedStakes(parseDetailedStake(parsed2), artists[0].address, user.address, 50, 60);
    });

    it('A user should not be able to increase the time of a stake if exceed the max', async () => {
        const user = users[0];

        await ftas.connect(user).stake(artists[0].address, 50, 3000);

        await ftas.connect(user).increaseAmountStaked(artists[0].address, 50);
        expect(await jtp.balanceOf(ftas.address)).to.equal(100);
        expect(await jtp.balanceOf(user.address)).to.equal(0);

        await expect(ftas.connect(user).extendStake(artists[0].address, 10e10))
            .to.be.revertedWith('FanToArtistStaking: the stake period exceed the maximum or less than minimum');
        expect(await jtp.balanceOf(ftas.address)).to.equal(100);
        expect(await jtp.balanceOf(user.address)).to.equal(0);

    });

    it('A user should not be able to increase the time of a stake if exceed the max', async () => {
        const user = users[0];
        const event = await ftas.connect(user).stake(artists[0].address, 50, 30);
        const parsed = await getStakeFromEvent(event);

        await ftas.connect(user).increaseAmountStaked(artists[0].address, 20);
        expect(await jtp.balanceOf(ftas.address)).to.equal(70);
        expect(await jtp.balanceOf(user.address)).to.equal(30);

        await ftas.connect(user).increaseAmountStaked(artists[0].address, 20);
        expect(await jtp.balanceOf(ftas.address)).to.equal(90);
        expect(await jtp.balanceOf(user.address)).to.equal(10);

        await expect(ftas.connect(user).extendStake(artists[0].address, parsed.end))
            .to.be.revertedWith('FanToArtistStaking: the stake period exceed the maximum or less than minimum');
        expect(await jtp.balanceOf(ftas.address)).to.equal(90);
        expect(await jtp.balanceOf(user.address)).to.equal(10);
    });

    it('A user should be able to change the artist staked', async () => {
        const user = users[0];

        const event = await ftas.connect(user).stake(artists[0].address, 50, 3000);
        const parsed = await getStakeFromEvent(event);

        await timeMachine(5);

        const event2 = await ftas.connect(user).changeArtistStaked(artists[0].address, artists[1].address);
        const parsed2 = await getStakeFromEvent(event2);
        expect(await jtp.balanceOf(ftas.address)).to.equal(50);
        expect(await jtp.balanceOf(user.address)).to.equal(50);

        const stake0 = parsed;
        const stake1 = parsed2;
        expect(stake0).to.not.be.undefined;
        expect(stake1).to.not.be.undefined;
        expect(stake0.amount).to.equal(stake1.amount);
    });

    it('An artist should be able to get the reward until his removal', async () => {
        const user = users[0];
        const artist = artists[0];

        const event = await ftas.connect(user).stake(artist.address, 50, 600);
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
        expect(await jtp.balanceOf(artists[0].address)).to.be.closeTo((600 * 50 / defArtistReward) / 2, 50);
    });

    it('A user should not be able to change the artist staked when doesnt meet the requirements', async () => {
        const user = users[0];

        await ftas.connect(user).stake(artists[0].address, 50, 3000);

        await expect(ftas.connect(user).changeArtistStaked(artists[1].address, users[0].address))
            .to.be.revertedWith('FanToArtistStaking: the artist is not a verified artist');
        await expect(ftas.connect(user).changeArtistStaked(artists[0].address, artists[0].address))
            .to.be.revertedWith('FanToArtistStaking: the new artist is the same as the old one');

        await ftas.connect(user).stake(artists[1].address, 50, 20);
        await expect(ftas.connect(user).changeArtistStaked(artists[0].address, artists[1].address))
            .to.be.revertedWith('FanToArtistStaking: already staking the new artist');
    });

    describe('Reward calculation', () => {
        it('Should get no reward if there is no staking', async () => {
            await expect(ftas.connect(artists[0]).getReward(artists[0].address, [users[0].address], [0], [0], [2]))
                .to.be.revertedWith('FanToArtistStaking: no stake found with this index');
            expect(await jtp.balanceOf(artists[0].address)).to.equal(0);
        });

        it('Should get the only his reward and not twice', async () => {
            const user0 = users[0];
            const user1 = users[1];
            const artist1 = artists[1];
            const artist2 = artists[2];

            await ftas.connect(user0).stake(artist1.address, 100, 60);
            await timeMachine(10);
            await ftas.connect(artist1).getReward(artist1.address, [user0.address], [0], [0], [10]);
            expect(await jtp.balanceOf(artist1.address)).to.equal(600);
            await ftas.changeArtistRewardRate(20, owner.address);

            await ftas.connect(user1).stake(artist2.address, 100, 60);
            await timeMachine(10);
            await ftas.connect(artist2).getReward(artist2.address, [user1.address], [0], [1], [10]);
            expect(await jtp.balanceOf(artist2.address)).to.equal(300);

            // await timeMachine(10);
            // await expect(ftas.connect(artist1).getReward(artist1.address, [user0.address], [0], [0], [10])).to.be.revertedWith('FanToArtistStaking: a stake was already redeemed completely');
            // expect(await jtp.balanceOf(artist1.address)).to.equal(600);
            // await expect(ftas.connect(artist2).getReward(artist2.address, [user1.address], [0], [0], [10])).to.be.revertedWith('FanToArtistStaking: a stake was already redeemed completely');
            // expect(await jtp.balanceOf(artist2.address)).to.equal(300);
        });

        it('Should get the same value if the rate is the same but in 2 different timeframes', async () => {
            const user0 = users[0];
            const user1 = users[1];
            const artist1 = artists[1];
            const artist2 = artists[2];

            await ftas.connect(user1).stake(artist2.address, 100, 600);
            await timeMachine(11);
            await ftas.connect(artist2).getReward(artist2.address, [user1.address], [0], [0], [10]);
            await ftas.connect(user0).stake(artist1.address, 100, 600);
            await timeMachine(5);
            await ftas.changeArtistRewardRate(defArtistReward, owner.address);
            await timeMachine(6);
            await ftas.connect(artist1).getReward(artist1.address, [user0.address], [0], [0], [10]);

            expect(await jtp.balanceOf(artist2.address)).to.equal(await jtp.balanceOf(artist1.address));
        });

        it('Should get the same value if the rate is the same but in 3 different timeframes', async () => {
            const user0 = users[0];
            const user1 = users[1];
            const artist1 = artists[1];
            const artist2 = artists[2];

            await ftas.connect(user1).stake(artist2.address, 100, 600);
            await timeMachine(11);
            await ftas.connect(artist2).getReward(artist2.address, [user1.address], [0], [0], [10]);
            await ftas.connect(user0).stake(artist1.address, 100, 900);
            await timeMachine(5);
            await ftas.changeArtistRewardRate(1000000, owner.address);
            await timeMachine(5);
            await ftas.changeArtistRewardRate(defArtistReward, owner.address);
            await timeMachine(6);
            await ftas.connect(artist1).getReward(artist1.address, [user0.address], [0], [0], [10]);

            expect(await jtp.balanceOf(artist2.address)).to.closeTo(await jtp.balanceOf(artist1.address), 20);
        });

        it('Should get half the value if the rate changes halfway', async () => {
            const user0 = users[0];
            const user1 = users[1];
            const artist1 = artists[1];
            const artist2 = artists[2];

            await ftas.connect(user1).stake(artist2.address, 100, 600);
            await timeMachine(11);
            await ftas.connect(artist2).getReward(artist2.address, [user1.address], [0], [0], [10]);
            await ftas.connect(user0).stake(artist1.address, 100, 600);
            await timeMachine(5);
            await ftas.changeArtistRewardRate(10000, owner.address);
            await timeMachine(6);
            await ftas.changeArtistRewardRate(10, owner.address);

            console.log('test')
            await ftas.connect(artist1).getReward(artist1.address, [user0.address], [0], [0], [10]);
            expect(Number(await jtp.balanceOf(artist2.address)) / 2).to.closeTo(await jtp.balanceOf(artist1.address), 20); //safe?
        });

        it('An artist should be able to get his reward', async () => {
            const user0 = users[0];
            const user1 = users[1];
            const user2 = users[2];
            const artist0 = artists[0];

            await jtp.mint(user0.address, 100);
            await ftas.changeArtistRewardRate(1, owner.address);
            await ftas.connect(user0).stake(artist0.address, 100, 100);
            await timeMachine(4);
            await ftas.connect(artist0).getReward(artist0.address, [user0.address], [0], [1], [10]);
            expect(await jtp.balanceOf(artist0.address)).to.equal(100 * 100 / 1);

            await ftas.connect(user1).stake(artist0.address, 50, 100);
            await timeMachine(4);

            await ftas.connect(artist0).getReward(artist0.address, [user1.address], [0], [1], [10]);
            const balancePrev = await jtp.balanceOf(artist0.address);
            expect(balancePrev).to.equal((100 * 100 / 1) + (50 * 100 / 1));

            await ftas.connect(user2).stake(artist0.address, 50, 10000);
            await timeMachine(5);
            await ftas.connect(artist0).getReward(artist0.address, [user2.address], [0], [1], [10]);
            const balanceMiddle = await jtp.balanceOf(artist0.address);
            await timeMachine(5);
            await ftas.connect(artist0).getReward(artist0.address, [user2.address], [0], [1], [10]);
            expect(balanceMiddle).to.be.greaterThan(balancePrev);
            expect(await jtp.balanceOf(artist0.address)).to.greaterThan(balanceMiddle);
        });

        it('An artist should get no reward if already redeemed it', async () => {
            const user0 = users[0];
            const artist0 = artists[0];

            await jtp.mint(user0.address, 100);
            await ftas.changeArtistRewardRate(1, owner.address);
            await ftas.connect(user0).stake(artist0.address, 100, 600); //staking 100 for 10 minutes
            await timeMachine(15);

            await ftas.connect(artist0).getReward(artist0.address, [user0.address], [0], [1], [10]);
            expect(await jtp.balanceOf(artist0.address)).to.be.equal(100 * 600 / 1); //amount * seconds / artistRate
            await timeMachine(15);
            await ftas.changeArtistRewardRate(10, owner.address);
            await timeMachine(5);

            await expect(ftas.connect(artist0).getReward(artist0.address, [user0.address], [0], [2], [10]))
                .to.be.revertedWith("FanToArtistStaking: a stake was already redeemed completely");
            await timeMachine(5);

            expect(await jtp.balanceOf(artist0.address)).to.be.equal(100 * 600 / 1); //amount * seconds / artistRate
            await ftas.changeArtistRewardRate(1, owner.address);
            await timeMachine(5);

            await ftas.connect(user0).stake(artist0.address, 100, 600); //staking 100 for 10 minutes
            await timeMachine(15);
            await ftas.connect(artist0).getReward(artist0.address, [user0.address], [1], [3], [10]);
            expect(await jtp.balanceOf(artist0.address)).to.be.equal((100 * 600 / 1) * 2); //amount * seconds / artistRate
        });
    });

    describe('Stress Batch', () => {
        it('All users should be able to stake the same artist', async () => {
            for await (const user of users)
                await ftas.connect(user).stake(artists[0].address, 100, 30)

            expect(await jtp.balanceOf(ftas.address)).to.equal(1300);

            await timeMachine(1);

            for await (const user of users)
                await ftas.connect(user).redeem(artists[0].address, user.address, 0);


            expect(await jtp.balanceOf(ftas.address)).to.equal(0);
        });

        it('All users should be able to stake all artists at the same time', async () => {
            const promises: Promise<ContractTransaction>[] = [];
            artists.forEach(artist =>
                users.forEach(user =>
                    promises.push(ftas.connect(user).stake(artist.address, 10, 30)))
            );
            await Promise.all(promises);



            expect(await jtp.balanceOf(ftas.address)).to.equal(10 * users.length * artists.length);

            await timeMachine(1);

            for await (const user of users)
                for (let i = 0; i < artists.length; i++)
                    await ftas.connect(user).redeem(artists[i].address, user.address, 0);


            expect(await jtp.balanceOf(ftas.address)).to.equal(0);
        });
    });
});