import { expect, use } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { FanToArtistStaking, JTP } from '../typechain-types/index';
import { getTimestamp, timeMachine } from './utils/utils';

describe('Voting Power Simulation', () => {
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
    
    it('Should get the totalSupply with a single passed stake', async () => {
        const user0 = users[0];
        const user1 = users[1];
        const user2 = users[2];
        const artist0 = artists[0];
        const artist1 = artists[1];

        await ftas.connect(user0).stake(artist0.address, 100, 30);
        await ftas.connect(user1).stake(artist1.address, 100, 30);
        await ftas.connect(user2).stake(artist0.address, 50, 30);
        await ftas.connect(user2).stake(artist1.address, 50, 30);
        await timeMachine(2);

        expect(await ftas.totalVotingPower()).to.equal((100*30)*3/10);
        expect(await ftas.votingPowerOf(user0.address)).to.equal((100*30)/10);
        expect(await ftas.votingPowerOf(user1.address)).to.equal((100*30)/10);
        expect(await ftas.votingPowerOf(user2.address)).to.equal((100*30)/10);

        const date = getTimestamp();
        expect(await ftas.totalVotingPowerAt(date)).to.equal((100*30)*3/10);
        expect(await ftas.votingPowerOfAt(user0.address, date)).to.equal((100*30)/10);
        expect(await ftas.votingPowerOfAt(user1.address, date)).to.equal((100*30)/10);
        expect(await ftas.votingPowerOfAt(user2.address, date)).to.equal((100*30)/10);
    });

    it('Should get the totalSupplyAt', async () => {
        const user0 = users[0];
        const user1 = users[1];
        const user2 = users[2];
        const artist0 = artists[0];

        await ftas.connect(user0).stake(artist0.address, 100, 30);
        // await timeMachine(2);

    });
});