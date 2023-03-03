import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect, use } from 'chai';
import { ethers } from 'hardhat';
require("@nomiclabs/hardhat-web3");
import { DEXLPool, DEXLFactory } from '../typechain-types/index';
import stableCoinContract from '../contracts/mocks/FiatTokenV2_1.json';
import { timeMachine, getPoolFromEvent, matchPool, getIndexFromProposal } from './utils/utils';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { PoolReducedStruct } from '../typechain-types/contracts/DEXLFactory';

describe('DEXLFactory', () => {
    let DEXLP: DEXLFactory;
    let owner: SignerWithAddress;
    let stableCoin: any;

    let artists: SignerWithAddress[]; //6
    let users: SignerWithAddress[]; //13
    let poolS: PoolReducedStruct = {
        fundingTokenContract: '0x00000000',
        softCap: 100,
        hardCap: 200,
        initialDeposit: 50,
        raiseEndDate: 0,
        terminationDate: 800,
        votingTime: 800,
        leaderCommission: 10e8,
        couponAmount: 20e8,
        quorum: 10e8,
        majority: 10e8,
        transferrable: false
    };

    beforeEach(async () => {
        const signers = await ethers.getSigners();
        owner = signers[0];
        artists = signers.slice(1, 7);
        users = signers.slice(7, 20);

        const dProp = await ethers.getContractFactory('DEXLFactory');
        DEXLP = await dProp.deploy() as DEXLFactory;
        await DEXLP.deployed();

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
        poolS.fundingTokenContract = stableCoin.address;

        await Promise.allSettled(users.map(u => stableCoin.mint(u.address, 1000)));
    });

    it('should deploy correctly a DEXLPool with the right Leader and transfer the initial deposit', async () => {
        await stableCoin.connect(users[0]).approve(DEXLP.address, 50);

        const pool0 = {
            leader: users[0].address,
            fundingTokenContract: stableCoin.address,
            leaderCommission: 10e8,
            softCap: 100,
            hardCap: 200,
            raiseEndDate: 0,
            couponAmount: 20e8,
            initialDeposit: 50,
            terminationDate: 800,
        }

        const hash = await getIndexFromProposal(await DEXLP.connect(users[0]).proposePool(poolS, "description"));
        const parsedPool = await DEXLP.getProposal(hash);
        matchPool(parsedPool, pool0);
        expect(await stableCoin.balanceOf(DEXLP.address)).to.equal(50);
        expect(await stableCoin.balanceOf(users[0].address)).to.equal(950);
        const receipt = await DEXLP.approveProposal(hash);

        await expect(DEXLP.approveProposal(hash)).to.be.revertedWith("DEXLFactory: Proposal can not be deployed");
        await expect(DEXLP.declineProposal(hash)).to.be.revertedWith("DEXLFactory: Proposal can not be deployed");
        const pool = await getPoolFromEvent(receipt);

        const DEXLPool = (await ethers.getContractFactory("DEXLPool")).attach(pool);
        expect(await DEXLPool.getLeader()).to.equal(users[0].address)
    });

    it('should return the token if is declined', async () => {
        await stableCoin.connect(users[0]).approve(DEXLP.address, 50);
        const hash = await getIndexFromProposal(await DEXLP.connect(users[0]).proposePool(poolS, "description"));
        expect(await stableCoin.balanceOf(DEXLP.address)).to.equal(50);
        expect(await stableCoin.balanceOf(users[0].address)).to.equal(950);
        await DEXLP.declineProposal(hash);
        expect(await stableCoin.balanceOf(DEXLP.address)).to.equal(0);
        expect(await stableCoin.balanceOf(users[0].address)).to.equal(1000);
    });

    it('should return the token if doesnt reach the softCap', async () => {
        const user0 = users[0];
        const user1 = users[1];
        const user2 = users[2];
        await stableCoin.connect(user0).approve(DEXLP.address, 50);
        poolS.softCap = 10000;
        poolS.hardCap = 20000;
        poolS.raiseEndDate = 60;
        const hash = await getIndexFromProposal(await DEXLP.connect(users[0]).proposePool(poolS, "description"));
        const pool = await getPoolFromEvent(await DEXLP.approveProposal(hash));
        const DEXLPool = (await ethers.getContractFactory("DEXLPool")).attach(pool);
        await stableCoin.connect(user1).approve(DEXLPool.address, 100);
        await DEXLPool.connect(user1).deposit(100, user1.address);
        await stableCoin.connect(user2).approve(DEXLPool.address, 100);
        await DEXLPool.connect(user2).deposit(100, user2.address);

        expect(await DEXLPool.balanceOf(user0.address)).to.equal(50);
        expect(await DEXLPool.balanceOf(user1.address)).to.equal(100);
        expect(await DEXLPool.balanceOf(user2.address)).to.equal(100);
        expect(await DEXLPool.totalSupply()).to.equal(250);
        expect(await stableCoin.balanceOf(DEXLPool.address)).to.equal(250);
        await timeMachine(4);
        await DEXLPool.connect(user0).withdraw(await DEXLPool.balanceOf(user0.address), user0.address, user0.address);
        await DEXLPool.connect(user1).withdraw(await DEXLPool.balanceOf(user1.address), user1.address, user1.address);
        await DEXLPool.connect(user2).withdraw(await DEXLPool.balanceOf(user2.address), user2.address, user2.address);

        expect(await stableCoin.balanceOf(user0.address)).to.equal(1000);
        expect(await stableCoin.balanceOf(user1.address)).to.equal(1000);
        expect(await stableCoin.balanceOf(user2.address)).to.equal(1000);
        expect(await DEXLPool.totalSupply()).to.equal(0);
        expect(await stableCoin.balanceOf(DEXLPool.address)).to.equal(0);
    });

    it('should give the revenue to the shareholders', async () => {
        const user0 = users[0];
        const user1 = users[1];
        const user2 = users[2];
        const user3 = users[3];
        await stableCoin.connect(user0).approve(DEXLP.address, 1000);
        const hash = await getIndexFromProposal(await DEXLP.connect(users[0]).proposePool(poolS, "description"));
        const pool = await getPoolFromEvent(await DEXLP.approveProposal(hash));
        const DEXLPool = (await ethers.getContractFactory("DEXLPool")).attach(pool);

        await stableCoin.connect(user1).approve(DEXLPool.address, 1000);
        await DEXLPool.connect(user1).deposit(1000, user1.address);
        await stableCoin.connect(user2).approve(DEXLPool.address, 1000);
        await DEXLPool.connect(user2).deposit(1000, user2.address);
        await timeMachine(6);

        await stableCoin.connect(user3).approve(DEXLPool.address, 600);
        await DEXLPool.connect(user3).redistributeRevenue(600);

        await timeMachine(18);
        await DEXLPool.connect(user1).redeem(Number(await DEXLPool.balanceOf(user1.address)), user1.address, user1.address);
    });

    it('should allow to propose more than one pool', async () => {
        const user0 = users[0];
        await stableCoin.connect(user0).approve(DEXLP.address, 1000);
        await DEXLP.connect(users[0]).proposePool(poolS, "description");
        await DEXLP.connect(users[0]).proposePool(poolS, "description");
    });

    it('should revert', async () => {
        const user0 = users[0];
        await expect(DEXLP.connect(user0).transferOwnership(stableCoin.address))
            .to.be.revertedWith("Ownable: caller is not the owner");

        poolS.softCap = 201;
        poolS.hardCap = 200;
        await expect(DEXLP.connect(user0).proposePool(poolS, "description")).to.be.revertedWith("DEXLFactory: softcap must be less or equal than the hardcap");

        poolS.softCap = 190;
        poolS.hardCap = 200;
        poolS.raiseEndDate = 801;
        poolS.terminationDate = 800;
        await expect(DEXLP.connect(user0).proposePool(poolS, "description"))
            .to.be.revertedWith("DEXLFactory: raiseEndDate must be less than the terminationDate");

        poolS.raiseEndDate = 790;
        poolS.terminationDate = 800;
        poolS.fundingTokenContract = '0x0000000000000000000000000000000000000000';
        await expect(DEXLP.connect(user0).proposePool(poolS, "description"))
            .to.be.revertedWith("DEXLFactory: the funding token contract's address can not be 0");

        poolS.fundingTokenContract = owner.address;
        poolS.leaderCommission = 10e8;
        poolS.couponAmount = 10e9 + 1;
        await expect(DEXLP.connect(user0).proposePool(poolS, "description"))
            .to.be.revertedWith("DEXLFactory: couponAmount value must be between 0 and 10e9");

        poolS.couponAmount = 10e8;
        poolS.leaderCommission = 10e9 + 1;
        await expect(DEXLP.connect(user0).proposePool(poolS, "description"))
            .to.be.revertedWith("DEXLFactory: leaderCommission value must be between 0 and 10e9");
        poolS.leaderCommission = 50e8;
        poolS.couponAmount = 50e8 + 1;
        await expect(DEXLP.connect(user0).proposePool(poolS, "description"))
            .to.be.revertedWith("DEXLFactory: the sum of leaderCommission and couponAmount must be lower than 10e9");
        await expect(DEXLP.connect(user0).approveProposal(10)).to.be.revertedWith('Ownable: caller is not the owner');
        await expect(DEXLP.connect(user0).declineProposal(10)).to.be.revertedWith('Ownable: caller is not the owner');
    });
});