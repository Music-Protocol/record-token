import { expect, use } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { FanToArtistStaking, JTP } from '../typechain-types/index';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';

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

    beforeEach(async () => {
        const signers = await ethers.getSigners();
        owner = signers[0];
        artists = signers.slice(1, 7);
        users = signers.slice(7, 20);

        const FTAS = await ethers.getContractFactory('FanToArtistStaking');
        ftas = await FTAS.deploy(defVeReward, defArtistReward, minStakeTime, maxStakeTime,);
        await ftas.deployed();

        const cJTP = await ethers.getContractFactory('JTP');
        jtp = await cJTP.deploy(ftas.address);
        await jtp.deployed();
        await ftas.setJTP(jtp.address);

        await Promise.allSettled([artists.forEach(artist =>
            ftas.addArtist(artist.address, owner.address)
        )]);
        await Promise.allSettled([users.forEach(user =>
            jtp.mint(user.address, 100)
        )]);
    });


    it('A users should not be able to stake the same artist if already has an active stake', async () => {
        const user = users[0];
        await ftas.connect(user).stake(artists[0].address, 50, 30);

        expect(await jtp.balanceOf(ftas.address)).to.equal(50);

        await expect(ftas.connect(user).stake(artists[0].address, 50, 30))
            .to.be.revertedWith('FanToArtistStaking: already staking');

        expect(await jtp.balanceOf(ftas.address)).to.equal(50);
        expect(await jtp.balanceOf(user.address)).to.equal(50);
        const parsed = parseDetailedStakes(await ftas.connect(user).getAllStake())[0];
        matchDetailedStakes(parsed, artists[0].address, user.address, 50, 30, defArtistReward, false);
    });

    it('A users should not be able to redeem a stake before his maturation', async () => {
        const user = users[0];
        await ftas.connect(user).stake(artists[0].address, 50, 30);

        expect(await jtp.balanceOf(ftas.address)).to.equal(50);

        const activeStake = await ftas.connect(user).getAllStake();
        const endTime = activeStake[0].stake.end.toNumber();
        await expect(ftas.connect(user).redeem(artists[0].address, endTime))
            .to.be.revertedWith('FanToArtistStaking: the stake is not ended');
        const parsed = parseDetailedStakes(await ftas.connect(user).getAllStake())[0];
        matchDetailedStakes(parsed, artists[0].address, user.address, 50, 30, defArtistReward, false);

        await timeMachine(1);
        await ftas.connect(user).redeem(artists[0].address, endTime);
        expect(await jtp.balanceOf(ftas.address)).to.equal(0);
        const parsed2 = parseDetailedStakes(await ftas.connect(user).getAllStake())[0];
        matchDetailedStakes(parsed2, artists[0].address, user.address, 50, 30, defArtistReward, true);

        await expect(ftas.connect(user).redeem(artists[0].address, endTime))
            .to.be.revertedWith('FanToArtistStaking: this stake has already been redeemed');
    });

    it('A user should be able to fetch all his stakes', async () => {
        async function StakeAndRedeem() {
            await ftas.connect(user).stake(artists[0].address, 100, 30);
            expect(await jtp.balanceOf(ftas.address)).to.equal(100);

            activeStake = await ftas.connect(user).getAllStake();
            endTime = Math.max(...activeStake.map(s => s.stake.end.toNumber()));
            await timeMachine(1);
            await ftas.connect(user).redeem(artists[0].address, endTime);
            expect(await jtp.balanceOf(ftas.address)).to.equal(0);
        }
        const user = users[0];
        let activeStake;
        let endTime;

        await StakeAndRedeem();
        await StakeAndRedeem();
        await StakeAndRedeem();
        expect((await ftas.connect(user).getAllStake()).length).to.equal(3);
    });

    it('A user should be able to increase the amount staked', async () => {
        const user = users[0];

        await ftas.connect(user).stake(artists[0].address, 50, 30);
        expect(await jtp.balanceOf(ftas.address)).to.equal(50);
        expect(await jtp.balanceOf(user.address)).to.equal(50);
        expect((await ftas.connect(user).getAllStake()).length).to.equal(1);
        const parsed = parseDetailedStakes(await ftas.connect(user).getAllStake())[0];
        matchDetailedStakes(parsed, artists[0].address, user.address, 50, 30, defArtistReward, false);

        const activeStake = await ftas.connect(user).getAllStake();
        const endTime = Math.max(...activeStake.map(s => s.stake.end.toNumber()));
        await ftas.connect(user).increaseAmountStaked(artists[0].address, 50, endTime);
        expect(await jtp.balanceOf(ftas.address)).to.equal(100);
        expect(await jtp.balanceOf(user.address)).to.equal(0);

        const parsed2 = parseDetailedStakes(await ftas.connect(user).getAllStake());
        matchDetailedStakes(parsed2[0], artists[0].address, user.address, 50, parsed2[0].duration, defArtistReward, true);
        matchDetailedStakes(parsed2[1], artists[0].address, user.address, 100, parsed2[1].duration, defArtistReward, false);
        expect(parsed2[0].duration + parsed2[1].duration).to.equal(30);
        expect((await ftas.connect(user).getAllStake()).length).to.equal(2);
    });

    it('A user should be able to increase the time of a stake', async () => {
        const user = users[0];

        await ftas.connect(user).stake(artists[0].address, 50, 30);
        expect((await ftas.connect(user).getAllStake()).length).to.equal(1);

        const activeStake = await ftas.connect(user).getAllStake();
        const endTime = Math.max(...activeStake.map(s => s.stake.end.toNumber()));
        await ftas.connect(user).extendStake(artists[0].address, endTime, 30);

        expect((await ftas.connect(user).getAllStake()).length).to.equal(1);
        const parsed = parseDetailedStakes(await ftas.connect(user).getAllStake());
        matchDetailedStakes(parsed[0], artists[0].address, user.address, 50, 60, defArtistReward, false);
    });

    it('A user should not be able to increase the time of a stake if exceed the max', async () => {
        const user = users[0];

        await ftas.connect(user).stake(artists[0].address, 50, 3000);
        expect((await ftas.connect(user).getAllStake()).length).to.equal(1);

        let activeStake = await ftas.connect(user).getAllStake();
        let endTime = Math.max(...activeStake.map(s => s.stake.end.toNumber()));
        await ftas.connect(user).increaseAmountStaked(artists[0].address, 50, endTime);
        expect(await jtp.balanceOf(ftas.address)).to.equal(100);
        expect(await jtp.balanceOf(user.address)).to.equal(0);
        expect((await ftas.connect(user).getAllStake()).length).to.equal(2);

        activeStake = await ftas.connect(user).getAllStake();
        endTime = Math.max(...activeStake.map(s => s.stake.end.toNumber()));
        await expect(ftas.connect(user).extendStake(artists[0].address, endTime, maxStakeTime + 1))
            .to.be.revertedWith('FanToArtistStaking: the stake period exceed the maximum');
        expect((await ftas.connect(user).getAllStake()).length).to.equal(2);
        expect(await jtp.balanceOf(ftas.address)).to.equal(100);
        expect(await jtp.balanceOf(user.address)).to.equal(0);

    });

    it('A user should not be able to increase the time of a stake if exceed the max', async () => {
        const user = users[0];

        await ftas.connect(user).stake(artists[0].address, 50, 30);
        expect((await ftas.connect(user).getAllStake()).length).to.equal(1);

        let activeStake = await ftas.connect(user).getAllStake();
        let endTime = Math.max(...activeStake.map(s => s.stake.end.toNumber()));
        await ftas.connect(user).increaseAmountStaked(artists[0].address, 20, endTime);
        expect(await jtp.balanceOf(ftas.address)).to.equal(70);
        expect(await jtp.balanceOf(user.address)).to.equal(30);
        expect((await ftas.connect(user).getAllStake()).length).to.equal(2);

        activeStake = await ftas.connect(user).getAllStake();
        endTime = Math.max(...activeStake.map(s => s.stake.end.toNumber()));
        await ftas.connect(user).increaseAmountStaked(artists[0].address, 20, endTime);
        expect(await jtp.balanceOf(ftas.address)).to.equal(90);
        expect(await jtp.balanceOf(user.address)).to.equal(10);
        expect((await ftas.connect(user).getAllStake()).length).to.equal(3);

        activeStake = await ftas.connect(user).getAllStake();
        endTime = Math.max(...activeStake.map(s => s.stake.end.toNumber()));
        await expect(ftas.connect(user).extendStake(artists[0].address, endTime, maxStakeTime + 1))
            .to.be.revertedWith('FanToArtistStaking: the stake period exceed the maximum');
        expect(await jtp.balanceOf(ftas.address)).to.equal(90);
        expect(await jtp.balanceOf(user.address)).to.equal(10);
        expect((await ftas.connect(user).getAllStake()).length).to.equal(3);
    });

    it('A user should be able to change the artist staked', async () => {
        const user = users[0];

        await ftas.connect(user).stake(artists[0].address, 50, 3000);
        let activeStake = await ftas.connect(user).getAllStake();
        let endTime = Math.max(...activeStake.map(s => s.stake.end.toNumber()));

        await timeMachine(5);

        await ftas.connect(user).changeArtistStaked(artists[0].address, artists[1].address, endTime);
        expect(await jtp.balanceOf(ftas.address)).to.equal(50);
        expect(await jtp.balanceOf(user.address)).to.equal(50);
        const parsedActiveStake = parseDetailedStakes(await ftas.connect(user).getAllStake());
        const stake0 = parsedActiveStake.filter(a => a.artist == artists[0].address)[0]
        const stake1 = parsedActiveStake.filter(a => a.artist == artists[1].address)[0]
        expect(stake0).to.not.be.undefined;
        expect(stake1).to.not.be.undefined;
        expect(parsedActiveStake.length).to.equal(2);
        expect(parsedActiveStake.reduce((a, b) => a + b.duration, 0)).to.equal(3000);//sum of the time should be the initial value
        expect(stake0.amount).to.equal(stake1.amount);
        expect(stake0.redeemed).to.equal(true);
        expect(stake1.redeemed).to.equal(false);
    });

    it('A user should not be able to change the artist staked when doesn meet the requirements', async () => {
        const user = users[0];

        await ftas.connect(user).stake(artists[0].address, 50, 3000);
        let activeStake = await ftas.connect(user).getAllStake();
        let endTime = Math.max(...activeStake.map(s => s.stake.end.toNumber()));

        await expect(ftas.connect(user).changeArtistStaked(users[0].address, artists[1].address, endTime))
            .to.be.revertedWith('FanToArtistStaking: the artist is not a verified artist');
        await expect(ftas.connect(user).changeArtistStaked(artists[0].address, artists[2].address, 0))
            .to.be.revertedWith('FanToArtistStaking: the stake is already ended');
        await expect(ftas.connect(user).changeArtistStaked(artists[0].address, artists[0].address, endTime))
            .to.be.revertedWith('FanToArtistStaking: the new artist is the same as the old one');
        await expect(ftas.connect(user).changeArtistStaked(artists[0].address, artists[1].address, endTime + 2))
            .to.be.revertedWith('FanToArtistStaking: no stake found with this end date');

        await ftas.connect(user).stake(artists[1].address, 50, 20);
        await expect(ftas.connect(user).changeArtistStaked(artists[0].address, artists[1].address, endTime))
            .to.be.revertedWith('FanToArtistStaking: already staking the new artist');
    });

    it('An artist should be able to see all the stakes', async () => {
        const user = users[0];
        expect((await ftas.connect(user).getAllArtistStake()).length).to.equal(0);

        const artist = artists[0];
        await ftas.connect(user).stake(artist.address, 50, 30);
        expect((await ftas.connect(artist).getAllArtistStake()).length).to.equal(1);
        await timeMachine(5);
        await ftas.connect(user).stake(artist.address, 50, 3000);
        expect((await ftas.connect(artist).getAllArtistStake()).length).to.equal(2);
        await ftas.connect(users[1]).stake(artist.address, 50, 3000);
        expect((await ftas.connect(artist).getAllArtistStake()).length).to.equal(3);

        let activeStake = await ftas.connect(users[1]).getAllStake();
        let endTime = Math.max(...activeStake.map(s => s.stake.end.toNumber()));
        await ftas.connect(users[1]).extendStake(artist.address, endTime, 10);
        expect((await ftas.connect(artist).getAllArtistStake()).length).to.equal(3);

        await ftas.connect(users[1]).increaseAmountStaked(artist.address, 10, endTime + 10);
        expect((await ftas.connect(artist).getAllArtistStake()).length).to.equal(4);
        await ftas.connect(users[1]).changeArtistStaked(artist.address, artists[1].address, endTime + 10);
        expect((await ftas.connect(artist).getAllArtistStake()).length).to.equal(4);
        expect((await ftas.connect(artists[1]).getAllArtistStake()).length).to.equal(1);
    });

    it('When an artist is removed every stake should stop', async () => {
        const user = users[0];
        const user1 = users[1];
        const user2 = users[2];
        const artist = artists[0];
        const artist1 = artists[1];

        await ftas.connect(user).stake(artist.address, 50, 300);
        const prev = parseDetailedStakes(await ftas.connect(artist).getAllArtistStake());
        expect(prev.length).to.equal(1);
        await ftas.connect(owner).removeArtist(artist.address, owner.address);
        const post = parseDetailedStakes(await ftas.connect(artist).getAllArtistStake());
        expect(post.length).to.equal(1);
        expect(post[0].duration).to.be.lessThan(prev[0].duration);

        await ftas.connect(user1).stake(artist1.address, 50, 300);
        await ftas.connect(user2).stake(artist1.address, 50, 300);
        const artist1stakes = parseDetailedStakes(await ftas.connect(artist1).getAllArtistStake());
        const prev1 = artist1stakes.filter(a => a.user == user1.address)[0]
        const prev2 = artist1stakes.filter(a => a.user == user2.address)[0]
        await ftas.connect(owner).removeArtist(artist1.address, owner.address);
        const post12 = parseDetailedStakes(await ftas.connect(artist1).getAllArtistStake());
        const post1 = post12.filter(a => a.user == user1.address)[0]
        const post2 = post12.filter(a => a.user == user2.address)[0]
        expect(post.length).to.equal(1);

        expect(post1.duration).to.be.lessThan(prev1.duration);
        expect(post2.duration).to.be.lessThan(prev2.duration);
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
        await ftas.connect(artist0).getReward();
        expect(await jtp.balanceOf(artist0.address)).to.equal(100 * 100 / 1);

        await ftas.connect(user1).stake(artist0.address, 50, 100);
        await timeMachine(4);
        await ftas.connect(artist0).getReward();
        const balancePrev = await jtp.balanceOf(artist0.address);
        expect(balancePrev).to.equal((100 * 100 / 1) + (50 * 100 / 1));

        await ftas.connect(user2).stake(artist0.address, 50, 10000);
        await timeMachine(5);
        await ftas.connect(artist0).getReward();
        const balanceMiddle = await jtp.balanceOf(artist0.address);
        await timeMachine(5);
        await ftas.connect(artist0).getReward();
        expect(balanceMiddle).to.be.greaterThan(balancePrev);
        expect(await jtp.balanceOf(artist0.address)).to.greaterThan(balanceMiddle);
    });

    it('Changing the ArtistRewardRate should split only the active stakes', async () => {
        const user0 = users[0];
        const user1 = users[1];
        const user2 = users[2];
        const artist0 = artists[0];
        const artist1 = artists[1];

        await ftas.connect(user0).stake(artist0.address, 100, 30);
        await timeMachine(3);
        await ftas.changeArtistRewardRate(20, user0.address);
        expect((await ftas.connect(artist0).getAllArtistStake()).length).to.equal(1);
        await ftas.connect(user1).stake(artist1.address, 100, 100);
        await ftas.connect(user2).stake(artist1.address, 100, 100);
        expect((await ftas.connect(artist1).getAllArtistStake()).length).to.equal(2);
        await ftas.changeArtistRewardRate(30, user0.address);
        expect((await ftas.connect(artist1).getAllArtistStake()).length).to.equal(4);
    });

    describe('Stress Batch', () => {
        it('All users should be able to stake the same artist', async () => {
            for await (const user of users)
                await ftas.connect(user).stake(artists[0].address, 100, 30)

            expect(await jtp.balanceOf(ftas.address)).to.equal(1300);

            await timeMachine(1);

            for await (const user of users) {
                const activeStake = await ftas.connect(user).getAllStake();
                const endTime = activeStake[0].stake.end.toNumber();
                await ftas.connect(user).redeem(artists[0].address, endTime);
            }

            expect(await jtp.balanceOf(ftas.address)).to.equal(0);
        });

        it('All users should be able to stake all artists at the same time', async () => {
            for await (const artist of artists)
                for await (const user of users)
                    await ftas.connect(user).stake(artist.address, 10, 30)

            expect(await jtp.balanceOf(ftas.address)).to.equal(10 * users.length * artists.length);

            await timeMachine(1);

            for await (const user of users) {
                const activeStake = await ftas.connect(user).getAllStake();
                for await (const stake of activeStake)
                    await ftas.connect(user).redeem(stake.artist, stake.stake.end);
            }

            expect(await jtp.balanceOf(ftas.address)).to.equal(0);
        });
    });
});