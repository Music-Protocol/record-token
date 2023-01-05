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

    async function timeMachine(minutes: number) {
        const blockNumBefore = await ethers.provider.getBlockNumber();
        const blockBefore = await ethers.provider.getBlock(blockNumBefore);
        await ethers.provider.send('evm_mine', [(60 * minutes) + blockBefore.timestamp]);
    }

    beforeEach(async () => {
        const signers = await ethers.getSigners();
        owner = signers[0];
        artists = signers.slice(1, 7);
        users = signers.slice(7, 20);

        const FTAS = await ethers.getContractFactory('FanToArtistStaking');
        ftas = await FTAS.deploy(defVeReward, defArtistReward, 10, 86400,);
        await ftas.deployed();

        const cJTP = await ethers.getContractFactory('JTP');
        jtp = await cJTP.deploy(ftas.address);
        await jtp.deployed();
        await ftas.setJTP(jtp.address);

        await Promise.all([artists.forEach(async artist =>
            await ftas.addArtist(artist.address, owner.address)
        )]);
        await Promise.all([users.forEach(async user =>
            await jtp.mint(user.address, 100)
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
    });

    it('A users should not be able redeem a stake before his maturation', async () => {
        const user = users[0];
        await ftas.connect(user).stake(artists[0].address, 50, 30);

        expect(await jtp.balanceOf(ftas.address)).to.equal(50);

        const activeStake = await ftas.connect(user).getAllStake();
        const endTime = activeStake[0].stake.end.toNumber();
        await expect(ftas.connect(user).redeem(artists[0].address, endTime))
            .to.be.revertedWith('FanToArtistStaking: you are trying to redeem a stake before his end');

        await timeMachine(1);
        
        await ftas.connect(user).redeem(artists[0].address, endTime);
        expect(await jtp.balanceOf(ftas.address)).to.equal(0);

    });

    it('A user should be able to fetch all his stakes', async () => {
        async function StakeAndRedeem (){
            await ftas.connect(user).stake(artists[0].address, 100, 30);
            expect(await jtp.balanceOf(ftas.address)).to.equal(100);
    
            activeStake = await ftas.connect(user).getAllStake();
            endTime = Math.max(...activeStake.map(s=>s.stake.end.toNumber()));
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

        const activeStake = await ftas.connect(user).getAllStake();
        const endTime = Math.max(...activeStake.map(s=>s.stake.end.toNumber()));
        await ftas.connect(user).incrementAmountStaked(artists[0].address, 50,endTime);
        expect(await jtp.balanceOf(ftas.address)).to.equal(100);
        expect(await jtp.balanceOf(user.address)).to.equal(0);
        
        expect((await ftas.connect(user).getAllStake()).length).to.equal(2);
    });

    it('A user should be able to increase the time of a stake', async () => {
        const user = users[0];

        await ftas.connect(user).stake(artists[0].address, 50, 30);
        expect((await ftas.connect(user).getAllStake()).length).to.equal(1);

        const activeStake = await ftas.connect(user).getAllStake();
        const endTime = Math.max(...activeStake.map(s=>s.stake.end.toNumber()));
        await ftas.connect(user).extendStake(artists[0].address, endTime, 30);
        
        expect((await ftas.connect(user).getAllStake()).length).to.equal(1);
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