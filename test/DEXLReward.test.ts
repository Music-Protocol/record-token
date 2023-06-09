import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
require("@nomiclabs/hardhat-web3");
import { DEXLPool, DEXLFactory, FanToArtistStaking, Web3MusicNativeToken } from '../typechain-types/index';
import stableCoinContract from '../contracts/mocks/FiatTokenV2_1.json';
import { timeMachine, getPoolFromEvent, getIndexFromProposal, getTimestamp } from './utils/utils';
import { PoolReducedStruct } from '../typechain-types/contracts/DEXLFactory';
import { ContractTransaction } from '@ethersproject/contracts';
import { BigNumber } from 'ethers';

describe('DEXLReward', () => {
    let DEXLF: DEXLFactory;
    let POOLADDRESS: DEXLPool;
    let owner: SignerWithAddress;
    let stableCoin: any;
    let fanToArtistStaking: FanToArtistStaking;
    let Web3MusicNativeToken: Web3MusicNativeToken;
    let pools: DEXLPool[] = [];

    let artists: SignerWithAddress[]; //6
    let users: SignerWithAddress[]; //13
    let poolStructure: PoolReducedStruct = {
        fundingTokenContract: '0x00000000',
        softCap: 100,
        hardCap: 2000,
        initialDeposit: 50,
        raiseEndDate: 120,
        terminationDate: 6000,
        votingTime: 800,
        leaderCommission: 10e7,
        couponAmount: 20e7,
        quorum: 10e7,
        majority: 10e7
    };
    const defVeReward = 10;
    const defArtistReward = 10;
    const minStakeTime = 10;
    const maxStakeTime = 864000;
    let DEXLRATE = 1;

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

        const dProp = await ethers.getContractFactory('DEXLFactory');
        DEXLF = await dProp.deploy() as DEXLFactory;
        await DEXLF.deployed();

        const cWeb3MusicNativeToken = await ethers.getContractFactory('Web3MusicNativeToken');
        Web3MusicNativeToken = await cWeb3MusicNativeToken.deploy(fanToArtistStaking.address, DEXLF.address);
        await Web3MusicNativeToken.deployed();
        await fanToArtistStaking.initialize(Web3MusicNativeToken.address, owner.address, defVeReward, defArtistReward, minStakeTime, maxStakeTime);

        await DEXLF.initialize(fanToArtistStaking.address, POOLADDRESS.address, Web3MusicNativeToken.address, 120, DEXLRATE);

        await Promise.allSettled(artists.map(artist =>
            fanToArtistStaking.addArtist(artist.address, owner.address)
        ));
        await Promise.allSettled(users.map(user =>
            Web3MusicNativeToken.mint(user.address, 100)
        ));
        const promises: Promise<ContractTransaction>[] = [];
        artists.forEach(artist =>
            users.forEach(user =>
                promises.push(fanToArtistStaking.connect(user).stake(artist.address, 10, 300)))
        );
        await Promise.all(promises);
        await fanToArtistStaking.connect(owner).setVotingPowerOf(users.map(u => u.address), users.map(u => 1000));
        await fanToArtistStaking.connect(owner).setTotalVotingPower(users.length * 1000);

        await timeMachine(6);


        const StableCoin = await ethers.getContractFactory(stableCoinContract.abi, stableCoinContract.bytecode);
        stableCoin = await StableCoin.deploy() as any;
        await stableCoin.deployed();

        await stableCoin.initialize(
            "USD Coin",
            "USDC",
            "USD",
            6,
            owner.address,
            owner.address,
            owner.address,
            owner.address
        );
        await stableCoin.initializeV2("USD Coin");
        await stableCoin.configureMinter(owner.address, 1000000e6);
        poolStructure.fundingTokenContract = stableCoin.address;

        await Promise.allSettled(users.map(u => stableCoin.mint(u.address, 1000)));

        for (let i = 0; i < 4; i++) {
            await stableCoin.connect(users[0]).approve(DEXLF.address, 100)
            const hash = await getIndexFromProposal(await DEXLF.connect(users[0]).proposePool(poolStructure, "description"));
            const receipt = await DEXLF.approveProposal(hash);
            const pool = await getPoolFromEvent(receipt);
            pools.push((await ethers.getContractFactory("DEXLPool")).attach(pool));
            await Promise.all(users.map(u => {
                return stableCoin.connect(u).approve(pools[i].address, 100);
            }));
            await Promise.all(users.map(u => {
                return pools[i].connect(u).deposit(100, u.address);
            }));
            await Promise.all(users.map(u => {
                return pools[i].connect(users[0]).accept(u.address);
            }));

        }
        await timeMachine((Number(poolStructure.raiseEndDate) / 60) + 1);
        const actives = await Promise.all(pools.map(p => p.isActive()));
        expect(actives.reduce((a, b) => a && b, true)).to.be.true;
    });

    it('test only one user', async () => {
        await DEXLF.connect(users[0]).castPreference([pools[0].address], [10e8], [], []);
        let pref = (await DEXLF.getPreferences(pools.map(p => p.address)));
        expect(pref[0]).to.be.equal(await fanToArtistStaking.votingPowerOf(users[0].address));
        expect(pref[1]).to.be.equal(0);
        expect(pref[2]).to.be.equal(0);
        expect(pref[3]).to.be.equal(0);
        expect(await DEXLF.getTotalNomination()).to.be.equal(pref[0]);
    });

    it('test change choice', async () => {
        await DEXLF.connect(users[0]).castPreference([pools[0].address], [10e8], [], []);
        await timeMachine(2); //to vote again
        await DEXLF.connect(users[0]).castPreference([pools[1].address], [10e8], [pools[0].address], [await fanToArtistStaking.votingPowerOf(users[0].address)]);
        let pref = (await DEXLF.getPreferences(pools.map(p => p.address)));
        expect(pref[0]).to.be.equal(0);
        expect(pref[1]).to.be.equal(await fanToArtistStaking.votingPowerOf(users[0].address));
        expect(pref[2]).to.be.equal(0);
        expect(pref[3]).to.be.equal(0);
        expect(await DEXLF.getTotalNomination()).to.be.equal(pref[1]);
    });

    it('test with all user', async () => {
        await Promise.all(users.map(u => DEXLF.connect(u).castPreference(pools.map(p => p.address), pools.map(p => 1 / pools.length * 10e8), [], [])))
        await timeMachine(2); //to vote again
        let pref = (await DEXLF.getPreferences(pools.map(p => p.address)));
        const totVP = await fanToArtistStaking.totalVotingPower();
        pref.forEach(p =>
            expect(p).to.be.equal(1 / pools.length * totVP.toNumber())
        );
        expect(await DEXLF.getTotalNomination()).to.be.equal(totVP);
        await Promise.all(users.map(u => DEXLF.connect(u).castPreference([pools[0].address], [10e8], pools.map(p => p.address), pools.map(p => pref[0].toNumber() / users.length))))
        pref = (await DEXLF.getPreferences(pools.map(p => p.address)));
        expect(await DEXLF.getTotalNomination()).to.be.equal(totVP);
        expect(pref[0]).to.be.equal(totVP);
        pref.slice(1).forEach(p =>
            expect(p).to.be.equal(0)
        );
    });

    it('test artist redeem', async () => {
        await DEXLF.connect(users[0]).castPreference([pools[0].address], [10e8], [], []);
        await pools[0].connect(users[0]).addArtist(artists[0].address);
        await expect(pools[0].connect(users[0]).addArtist(artists[0].address)).to.be.revertedWith('DEXLPool: artist already nominated');
        let rewardRate = 1;
        await DEXLF.changeRewardRate(rewardRate);
        await pools[0].connect(artists[0]).payArtists();
        const totalAmountStaked = (await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).toNumber();
        const time1 = (await pools[0].getActivityTime()).toNumber();
        const artistR1 = (await Web3MusicNativeToken.balanceOf(artists[0].address)).toNumber();
        expect(artistR1).to.be.equal(totalAmountStaked * time1 / rewardRate);
        await timeMachine(90);
        rewardRate = 2;
        await DEXLF.changeRewardRate(rewardRate);
        await pools[0].connect(artists[0]).payArtists();
        const time2 = (await pools[0].getActivityTime()).toNumber();
        const artistR2 = (await Web3MusicNativeToken.balanceOf(artists[0].address)).toNumber();
        expect(artistR2 - artistR1).to.be.equal(totalAmountStaked * (time2 - time1) / rewardRate);
    });
});