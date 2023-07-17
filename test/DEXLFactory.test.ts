import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
require("@nomiclabs/hardhat-web3");
import { DEXLPool, DEXLFactory } from '../typechain-types/index';
import stableCoinContract from '../contracts/mocks/FiatTokenV2_1.json';
import { timeMachine, getPoolFromEvent, matchPool, getIndexFromProposal } from './utils/utils';
import { PoolReducedStruct } from '../typechain-types/contracts/DEXLFactory';

describe('DEXLFactory', () => {
    let DEXLF: DEXLFactory;
    let POOLADDRESS: DEXLPool;
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
        leaderCommission: 10e7,
        couponAmount: 20e7,
        quorum: 10e7,
        majority: 10e7,
    };

    before(async () => {
        const Pool = await ethers.getContractFactory('DEXLPool');
        POOLADDRESS = await Pool.deploy() as DEXLPool;
        await POOLADDRESS.deployed();
    });

    beforeEach(async () => {
        const signers = await ethers.getSigners();
        owner = signers[0];
        artists = signers.slice(1, 7);
        users = signers.slice(7, 20);



        const dProp = await ethers.getContractFactory('DEXLFactory');
        DEXLF = await dProp.deploy() as DEXLFactory;
        await DEXLF.deployed();
        await DEXLF.initialize(owner.address, POOLADDRESS.address, owner.address, 120, 1);

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
        await stableCoin.connect(users[0]).approve(DEXLF.address, 50);

        const pool0 = {
            leader: users[0].address,
            fundingTokenContract: stableCoin.address,
            leaderCommission: 10e7,
            softCap: 100,
            hardCap: 200,
            raiseEndDate: 0,
            couponAmount: 20e7,
            initialDeposit: 50,
            terminationDate: 800,
        }

        const hash = await getIndexFromProposal(await DEXLF.connect(users[0]).proposePool(poolS, "description"));
        const parsedPool = await DEXLF.getProposal(hash);
        matchPool(parsedPool, pool0);
        expect(await stableCoin.balanceOf(DEXLF.address)).to.equal(50);
        expect(await stableCoin.balanceOf(users[0].address)).to.equal(950);
        const receipt = await DEXLF.approveProposal(hash);

        await expect(DEXLF.approveProposal(hash)).to.be.revertedWith("DEXLFactory: Proposal can not be deployed");
        await expect(DEXLF.declineProposal(hash)).to.be.revertedWith("DEXLFactory: Proposal can not be deployed");
        const pool = await getPoolFromEvent(receipt);

        const DEXLPool = (await ethers.getContractFactory("DEXLPool")).attach(pool);
        expect(await DEXLPool.getLeader()).to.equal(users[0].address)
    });

    it('should return the token if is declined', async () => {
        await stableCoin.connect(users[0]).approve(DEXLF.address, 50);
        const hash = await getIndexFromProposal(await DEXLF.connect(users[0]).proposePool(poolS, "description"));
        expect(await stableCoin.balanceOf(DEXLF.address)).to.equal(50);
        expect(await stableCoin.balanceOf(users[0].address)).to.equal(950);
        await DEXLF.declineProposal(hash);
        expect(await stableCoin.balanceOf(DEXLF.address)).to.equal(0);
        expect(await stableCoin.balanceOf(users[0].address)).to.equal(1000);
    });

    it('should return the token if doesnt reach the softCap', async () => {
        const leader = users[0];
        const user1 = users[1];
        const user2 = users[2];
        await stableCoin.connect(leader).approve(DEXLF.address, 50);
        poolS.softCap = 10000;
        poolS.hardCap = 20000;
        poolS.raiseEndDate = 60;
        const hash = await getIndexFromProposal(await DEXLF.connect(leader).proposePool(poolS, "description"));
        const pool = await getPoolFromEvent(await DEXLF.approveProposal(hash));
        const DEXLPool = (await ethers.getContractFactory("DEXLPool")).attach(pool);
        await stableCoin.connect(user1).approve(DEXLPool.address, 100);
        await DEXLPool.connect(user1).deposit(100, user1.address);
        await DEXLPool.connect(leader).accept(user1.address, 100);
        await stableCoin.connect(user2).approve(DEXLPool.address, 100);
        await DEXLPool.connect(user2).deposit(100, user2.address);
        await DEXLPool.connect(leader).accept(user2.address, 100);

        expect(await DEXLPool.balanceOf(leader.address)).to.equal(50);
        expect(await DEXLPool.balanceOf(user1.address)).to.equal(100);
        expect(await DEXLPool.balanceOf(user2.address)).to.equal(100);
        expect(await DEXLPool.totalSupply()).to.equal(250);
        expect(await stableCoin.balanceOf(DEXLPool.address)).to.equal(250);
        await timeMachine(4);
        await DEXLPool.connect(leader).withdraw(await DEXLPool.balanceOf(leader.address), leader.address, leader.address);
        await DEXLPool.connect(user1).withdraw(await DEXLPool.balanceOf(user1.address), user1.address, user1.address);
        await DEXLPool.connect(user2).withdraw(await DEXLPool.balanceOf(user2.address), user2.address, user2.address);

        expect(await stableCoin.balanceOf(leader.address)).to.equal(1000);
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
        await stableCoin.connect(user0).approve(DEXLF.address, 1000);
        const hash = await getIndexFromProposal(await DEXLF.connect(users[0]).proposePool(poolS, "description"));
        const pool = await getPoolFromEvent(await DEXLF.approveProposal(hash));
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
        await stableCoin.connect(user0).approve(DEXLF.address, 1000);
        await DEXLF.connect(users[0]).proposePool(poolS, "description");
        await DEXLF.connect(users[0]).proposePool(poolS, "description");
    });

    it('should revert', async () => {
        const user0 = users[0];
        await expect(DEXLF.connect(user0).transferOwnership(stableCoin.address))
            .to.be.revertedWith("Ownable: caller is not the owner");

        poolS.softCap = 201;
        poolS.hardCap = 200;
        await expect(DEXLF.connect(user0).proposePool(poolS, "description")).to.be.revertedWith("DEXLFactory: softcap must be less or equal than the hardcap");

        poolS.softCap = 190;
        poolS.hardCap = 200;
        poolS.raiseEndDate = 801;
        poolS.terminationDate = 800;
        await expect(DEXLF.connect(user0).proposePool(poolS, "description"))
            .to.be.revertedWith("DEXLFactory: raiseEndDate must be less than the terminationDate");

        poolS.raiseEndDate = 790;
        poolS.terminationDate = 800;
        poolS.fundingTokenContract = '0x0000000000000000000000000000000000000000';
        await expect(DEXLF.connect(user0).proposePool(poolS, "description"))
            .to.be.revertedWith("DEXLFactory: the funding token contract's address can not be 0");

        poolS.fundingTokenContract = owner.address;
        poolS.leaderCommission = 10e7;
        poolS.couponAmount = 10e8 + 1;
        await expect(DEXLF.connect(user0).proposePool(poolS, "description"))
            .to.be.revertedWith("DEXLFactory: couponAmount value must be between 0 and 10e8");

        poolS.couponAmount = 10e7;
        poolS.leaderCommission = 10e8 + 1;
        await expect(DEXLF.connect(user0).proposePool(poolS, "description"))
            .to.be.revertedWith("DEXLFactory: leaderCommission value must be between 0 and 10e8");
        poolS.leaderCommission = 50e7;
        poolS.couponAmount = 50e7 + 1;
        await expect(DEXLF.connect(user0).proposePool(poolS, "description"))
            .to.be.revertedWith("DEXLFactory: the sum of leaderCommission and couponAmount must be lower than 10e8");
        await expect(DEXLF.connect(user0).approveProposal(10)).to.be.revertedWith('Ownable: caller is not the owner');
        await expect(DEXLF.connect(user0).declineProposal(10)).to.be.revertedWith('DEXLFactory: a proposal can only be declined by the leader or the owner');
    });
});