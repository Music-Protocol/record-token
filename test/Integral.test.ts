import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect, use } from 'chai';
import { ethers } from 'hardhat';
require("@nomiclabs/hardhat-web3");
import { DEXLPool, FanToArtistStaking, JTP } from '../typechain-types/index';
import { timeMachine, parseDatesStakes, getTimestamp } from './utils/utils';
import { ContractTransaction } from '@ethersproject/contracts';

describe('DEXLReward', () => {
    let POOLADDRESS: DEXLPool;
    let owner: SignerWithAddress;
    let fanToArtistStaking: FanToArtistStaking;
    let jtp: JTP;
    let pools: DEXLPool[] = [];

    let artists: SignerWithAddress[]; //6
    let users: SignerWithAddress[]; //13

    const defVeReward = 10;
    const defArtistReward = 10;
    const minStakeTime = 10;
    const maxStakeTime = 864000;
    let timestamp = 0;

    beforeEach(async () => {
        pools = [];
        const Pool = await ethers.getContractFactory('DEXLPool');
        POOLADDRESS = await Pool.deploy() as DEXLPool;
        await POOLADDRESS.deployed();

        const signers = await ethers.getSigners();
        owner = signers[0];
        artists = signers.slice(1, 7);
        users = signers.slice(7, 20);

        const FTAS = await ethers.getContractFactory('FanToArtistStaking');
        fanToArtistStaking = await FTAS.deploy();
        await fanToArtistStaking.deployed();

        const cJTP = await ethers.getContractFactory('JTP');
        jtp = await cJTP.deploy(fanToArtistStaking.address, fanToArtistStaking.address);
        await jtp.deployed();
        await fanToArtistStaking.initialize(jtp.address, defVeReward, defArtistReward, minStakeTime, maxStakeTime);

        await Promise.allSettled(artists.map(artist =>
            fanToArtistStaking.addArtist(artist.address, owner.address)
        ));
        await Promise.allSettled(users.map(user =>
            jtp.mint(user.address, 1000)
        ));

    });

    it('integral with horizontal stakes', async () => {
        const promises: Promise<ContractTransaction>[] = [];
        artists.forEach(artist => promises.push(fanToArtistStaking.connect(users[0]).stake(artist.address, 10, 300))
        );
        await Promise.all(promises);
        await timeMachine(5);
        const blockNumBefore = await ethers.provider.getBlockNumber();
        const blockBefore = await ethers.provider.getBlock(blockNumBefore);
        timestamp = blockBefore.timestamp;

        const p = parseDatesStakes(await fanToArtistStaking.connect(users[0]).getAllUserStake())
        const max = Math.max(...p.map(s => s.end))
        const min = Math.min(...p.map(s => s.start))
        await timeMachine(2);
        console.log(await fanToArtistStaking.calculateOverallStake(min, max));
        expect(Number(await fanToArtistStaking.calculateOverallStake(min, max))).to.be.equal(artists.length * 10 * 300);
        expect(Number(await fanToArtistStaking.calculateOverallStake(0, timestamp))).to.be.equal(artists.length * 10 * 300);
        await timeMachine(20);
        timestamp = await getTimestamp();
        expect(Number(await fanToArtistStaking.calculateOverallStake(0, timestamp))).to.be.equal(artists.length * 10 * 300);
    });

    it('integral with vertical stakes', async () => {
        for (let i = 0; i < 10; i++) {
            await fanToArtistStaking.connect(users[0]).stake(artists[0].address, 10, 300);
            await timeMachine(5);
        }
        const blockNumBefore = await ethers.provider.getBlockNumber();
        const blockBefore = await ethers.provider.getBlock(blockNumBefore);
        timestamp = blockBefore.timestamp;

        const p = parseDatesStakes(await fanToArtistStaking.connect(users[0]).getAllUserStake())
        const max = Math.max(...p.map(s => s.end))
        const min = Math.min(...p.map(s => s.start))
        await timeMachine(2);
        console.log(await fanToArtistStaking.calculateOverallStake(min, max));
        expect(Number(await fanToArtistStaking.calculateOverallStake(min, max))).to.be.equal(10 * 10 * 300);
        expect(Number(await fanToArtistStaking.calculateOverallStake(0, timestamp))).to.be.equal(10 * 10 * 300);
        await timeMachine(20);
        timestamp = await getTimestamp();
        expect(Number(await fanToArtistStaking.calculateOverallStake(0, timestamp))).to.be.equal(10 * 10 * 300);
    });
});