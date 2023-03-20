import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
require("@nomiclabs/hardhat-web3");
import { DEXLPool, DEXLFactory, ERC20 } from '../typechain-types/index';
import stableCoinContract from '../contracts/mocks/FiatTokenV2_1.json';
import { timeMachine, getPoolFromEvent, calcPoolRevenues, getProposalHash, getIndexFromProposal } from './utils/utils';
import { BigNumber } from 'ethers';
import { PoolReducedStruct } from '../typechain-types/contracts/DEXLFactory';



type StableCoin = {
    initializeV2: any;
    initialize: any;
    configureMinter: any;
    mint: any;

};
describe('DEXLPool', () => {
    let DEXLF: DEXLFactory;
    let POOLADDRESS: DEXLPool;

    let owner: SignerWithAddress;
    let leader: SignerWithAddress;
    let stableCoin: ERC20 & StableCoin;

    let artists: SignerWithAddress[]; //6
    let users: SignerWithAddress[]; //13

    before(async () => {
        const Pool = await ethers.getContractFactory('DEXLPool');
        POOLADDRESS = await Pool.deploy() as DEXLPool;
        await POOLADDRESS.deployed();
    });

    beforeEach(async () => {
        const signers = await ethers.getSigners();
        owner = signers[0];
        leader = signers[1];

        artists = signers.slice(2, 7);
        users = signers.slice(7, 20);

        const dProp = await ethers.getContractFactory('DEXLFactory');
        DEXLF = await dProp.deploy() as DEXLFactory;
        await DEXLF.deployed();
        await DEXLF.initialize(owner.address, POOLADDRESS.address, owner.address, 120, 1);

        const StableCoin = await ethers.getContractFactory(stableCoinContract.abi, stableCoinContract.bytecode);
        // @ts-ignore
        stableCoin = await StableCoin.deploy();
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
        await stableCoin.mint(leader.address, 1000);
        await Promise.allSettled(users.map(s => stableCoin.mint(s.address, 1000)));
    });


    describe('funding', () => {
        let POOL: DEXLPool;
        const leaderCommission = 10e7; //10%
        const softCap = 200;
        const hardCap = 3000;
        const raiseEndDate = 120; //2 min
        const couponAmount = 20e7; // 20%
        const initialDeposit = 50;
        const terminationDate = 900; // 15 min 
        const quorum = 30e7; // 30%
        const majority = 50e7; // 50%
        const votingTime = 600; // 10 min
        let poolS: PoolReducedStruct;
        beforeEach(async () => {
            await stableCoin.connect(leader).approve(DEXLF.address, initialDeposit);
            poolS = {
                fundingTokenContract: stableCoin.address,
                softCap,
                hardCap,
                initialDeposit,
                raiseEndDate,
                terminationDate,
                votingTime,
                leaderCommission,
                couponAmount,
                quorum,
                majority,
                transferrable: false
            };
            const hash = await getIndexFromProposal(await DEXLF.connect(leader).proposePool(poolS, "description"));
            const temPool = await getPoolFromEvent(await DEXLF.connect(owner).approveProposal(hash));
            POOL = (await ethers.getContractFactory("DEXLPool")).attach(temPool);
        });

        it('should allow the leader to deposit again', async () => {
            await stableCoin.connect(leader).approve(POOL.address, 50);
            await POOL.connect(leader).deposit(50, leader.address);
        });

        it('should set the right owner and be able to change the leader', async () => {
            expect(await POOL.connect(artists[2]).owner()).to.equal(owner.address);
            expect(await POOL.getLeader()).to.equal(leader.address);
            await POOL.connect(owner).setLeader(artists[2].address);
            expect(await POOL.getLeader()).to.equal(artists[2].address);
        });

        it('should be able to do multiple deposits and to withdraw them if the softCap is not reached', async () => {
            await Promise.all(users.map(u => {
                return stableCoin.connect(u).approve(POOL.address, 10);
            }));
            await Promise.all(users.map(u => {
                return POOL.connect(u).deposit(10, u.address);
            }));
            expect(await stableCoin.balanceOf(POOL.address)).to.equal(initialDeposit + (users.length * 10));
            expect(await POOL.totalAssets()).to.equal(initialDeposit + (users.length * 10));
            await timeMachine((raiseEndDate / 60) + 1);
            await Promise.all(users.map(u => {
                return POOL.connect(u).withdraw(10, u.address, u.address);
            }));
            expect(await stableCoin.balanceOf(POOL.address)).to.equal(initialDeposit);
            expect(await POOL.totalAssets()).to.equal(initialDeposit);

            await POOL.connect(leader).withdraw(initialDeposit, leader.address, leader.address);
            expect(await stableCoin.balanceOf(POOL.address)).to.equal(0);
            expect(await POOL.totalAssets()).to.equal(0);

            users.forEach(async u => expect(await stableCoin.balanceOf(u.address)).to.equal(1000));
            expect(await stableCoin.balanceOf(leader.address)).to.equal(1000);
        });

        it('should redistribute the revenues', async () => {
            await Promise.all(users.map(u => {
                return stableCoin.connect(u).approve(POOL.address, 100);
            }));
            await Promise.all(users.map(u => {
                return POOL.connect(u).deposit(100, u.address);
            }));
            const raised = Number(await stableCoin.balanceOf(POOL.address));
            await stableCoin.mint(artists[0].address, raised);
            await stableCoin.connect(artists[0]).approve(POOL.address, raised);
            await POOL.connect(artists[0]).redistributeRevenue(raised);

            await timeMachine((900 / 60) + 1);
            const reward = calcPoolRevenues(raised, leaderCommission, couponAmount);
            expect(await stableCoin.balanceOf(POOL.address)).to.equal(raised + reward.pool);
        });

        it('should test early closure', async () => {
            await Promise.all(users.map(u => {
                return stableCoin.connect(u).approve(POOL.address, 100);
            }));
            await Promise.all(users.map(u => {
                return POOL.connect(u).deposit(100, u.address);
            }));
            await timeMachine((raiseEndDate / 60) + 1);
            const prevTermDate = await POOL.getTerminationDate();
            const hash = await getProposalHash(await POOL.connect(users[2]).proposeEarlyClosure('Porto io?'));

            await Promise.all(users.map(u => {
                return POOL.connect(u).voteProposal(hash, true);
            }));
            await timeMachine(votingTime / 60);

            await POOL.executeProposal(hash);
            expect(prevTermDate).to.be.greaterThan(await POOL.getTerminationDate());
        });

        it('should test artist founding', async () => {
            await Promise.all(users.map(u => {
                return stableCoin.connect(u).approve(POOL.address, 100);
            }));
            await Promise.all(users.map(u => {
                return POOL.connect(u).deposit(100, u.address);
            }));
            await timeMachine((raiseEndDate / 60) + 1);

            const prevAssets = (await POOL.totalAssets()) as BigNumber;
            const hash = await getProposalHash(await POOL.connect(leader).proposeFounding(artists[0].address, 100, '100 servizio completo'));

            await Promise.all(users.map(u => {
                return POOL.connect(u).voteProposal(hash, true);
            }));
            await timeMachine((votingTime / 60) + 1);

            await POOL.executeProposal(hash);
            expect(await POOL.totalAssets()).to.be.equal(prevAssets.sub(100));
        });

        it('should revert if a referendum is approved', async () => {
            await Promise.all(users.map(u => {
                return stableCoin.connect(u).approve(POOL.address, 100);
            }));
            await Promise.all(users.map(u => {
                return POOL.connect(u).deposit(100, u.address);
            }));
            await timeMachine((raiseEndDate / 60) + 1);

            const hash = await getProposalHash(await POOL.connect(leader).proposeReferendum('Meglio far invidia che pietà'));
            await Promise.all(users.map(u => {
                return POOL.connect(u).voteProposal(hash, true);
            }));
            await timeMachine((votingTime / 60) + 1);

            await POOL.executeProposal(hash);
        });

        it('should emit the right event on proposal', async () => {
            poolS.initialDeposit = 0;
            const hash = await getIndexFromProposal(await DEXLF.connect(leader).proposePool(poolS, "description"));
            await DEXLF.approveProposal(hash);
        });

        it('should test a transferrable proposal', async () => {
            poolS.transferrable = true;
            poolS.initialDeposit = 100;
            await stableCoin.connect(leader).approve(DEXLF.address, poolS.initialDeposit);
            const hash = await getIndexFromProposal(await DEXLF.connect(leader).proposePool(poolS, "description"));
            const temPool = await getPoolFromEvent(await DEXLF.connect(owner).approveProposal(hash));
            POOL = (await ethers.getContractFactory("DEXLPool")).attach(temPool);

            await stableCoin.connect(users[0]).approve(POOL.address, 100);
            await stableCoin.connect(users[1]).approve(POOL.address, 100);
            await POOL.connect(users[0]).deposit(100, users[0].address);
            await POOL.connect(users[1]).deposit(100, users[1].address);

            await POOL.connect(users[0]).transfer(users[1].address, 100);
            expect(await POOL.balanceOf(users[1].address)).to.equal(200);

            await timeMachine((Number(poolS.raiseEndDate) / 60) + 1);
            await stableCoin.mint(artists[0].address, 1000);
            await stableCoin.connect(artists[0]).approve(POOL.address, 300);
            const prevAddr0 = await stableCoin.balanceOf(users[0].address);
            const prevAddr1 = await stableCoin.balanceOf(users[1].address);

            await POOL.connect(artists[0]).redistributeRevenue(300);
            expect(await stableCoin.balanceOf(users[0].address)).to.be.equal(prevAddr0);
            expect(await stableCoin.balanceOf(users[1].address)).to.be.greaterThan(prevAddr1);
        });

        it('should not execute if quorum is not reached', async () => {
            await Promise.all(users.map(u => {
                return stableCoin.connect(u).approve(POOL.address, 100);
            }));
            await Promise.all(users.map(u => {
                return POOL.connect(u).deposit(100, u.address);
            }));
            await timeMachine((raiseEndDate / 60) + 1);
            const prevTermDate = await POOL.getTerminationDate();
            const hash = await getProposalHash(await POOL.connect(users[2]).proposeEarlyClosure('Porto io?'));

            await timeMachine((votingTime / 60) + 1);
            await POOL.executeProposal(hash);
            expect(prevTermDate).to.be.equal(await POOL.getTerminationDate());
        });

        it('should not execute if majority is not reached', async () => {
            await Promise.all(users.map(u => {
                return stableCoin.connect(u).approve(POOL.address, 100);
            }));
            await Promise.all(users.map(u => {
                return POOL.connect(u).deposit(100, u.address);
            }));
            await timeMachine((raiseEndDate / 60) + 1);
            const prevTermDate = await POOL.getTerminationDate();
            const hash = await getProposalHash(await POOL.connect(users[2]).proposeEarlyClosure('Porto io?'));

            const yesUser = users.slice(0, 6);
            const noUser = users.slice(- 7);
            await Promise.all(yesUser.map(u => {
                return POOL.connect(u).voteProposal(hash, true);
            }));
            await Promise.all(noUser.map(u => {
                return POOL.connect(u).voteProposal(hash, false);
            }));

            await timeMachine((votingTime / 60) + 1);
            await POOL.executeProposal(hash);
            expect(prevTermDate).to.be.equal(await POOL.getTerminationDate());
        });

        it('should revert if someone tries to vote twice', async () => {
            await Promise.all(users.map(u => {
                return stableCoin.connect(u).approve(POOL.address, 100);
            }));
            await Promise.all(users.map(u => {
                return POOL.connect(u).deposit(100, u.address);
            }));
            await timeMachine((raiseEndDate / 60) + 1);
            const hash = await getProposalHash(await POOL.connect(users[2]).proposeEarlyClosure('Porto io?'));

            await POOL.connect(users[0]).voteProposal(hash, true);
            await expect(POOL.connect(users[0]).voteProposal(hash, true))
                .to.be.revertedWith("DEXLPool: caller already voted");
        });
    });



    it('should revert', async () => {
        await stableCoin.connect(leader).approve(DEXLF.address, 50);
        let poolS: PoolReducedStruct = {
            fundingTokenContract: stableCoin.address,
            softCap: 100,
            hardCap: 200,
            initialDeposit: 50,
            raiseEndDate: 120, //2 min
            terminationDate: 900, // 15 min 
            votingTime: 600, // 10 min
            leaderCommission: 10e7,
            couponAmount: 20e7, // 20%
            quorum: 30e7, // 30%
            majority: 50e7, // 50%
            transferrable: false
        };

        const hash = await getIndexFromProposal(await DEXLF.connect(leader).proposePool(poolS, "description"));
        const temPool = await getPoolFromEvent(await DEXLF.approveProposal(hash));
        const POOL = (await ethers.getContractFactory("DEXLPool")).attach(temPool);
        await stableCoin.connect(users[0]).approve(POOL.address, 50);
        await POOL.connect(users[0]).deposit(50, users[0].address);

        await stableCoin.mint(leader.address, 10e5);
        await expect(POOL.connect(leader).deposit(10e5, leader.address))
            .to.be.revertedWith("DEXLPool: you can not deposit more than hardcap");
        await expect(POOL.connect(leader).withdraw(10, leader.address, leader.address))
            .to.be.revertedWith("DEXLPool: you can not withdraw before the raise end date");

        await expect(POOL.connect(leader).redeem(10, leader.address, leader.address))
            .to.be.revertedWith("DEXLPool: you can not redeem before the termination date");
        await timeMachine(10);
        await expect(POOL.connect(leader).deposit(10, leader.address))
            .to.be.revertedWith("DEXLPool: you can not join a pool after the raise end date");
        await expect(POOL.connect(leader).redistributeRevenue(0))
            .to.be.revertedWith("DEXLPool: the amount can not be 0");

        await expect(POOL.connect(leader).withdraw(10, leader.address, leader.address))
            .to.be.revertedWith("DEXLPool: you can not withdraw if the soft cap is reached");

        //disabled function
        await expect(POOL.transfer(leader.address, 100))
            .to.be.revertedWith("DEXLPool: function disabled");
        await expect(POOL.transferFrom(leader.address, leader.address, 100))
            .to.be.revertedWith("DEXLPool: function disabled");
        await expect(POOL.approve(leader.address, 100))
            .to.be.revertedWith("DEXLPool: function disabled");
        await expect(POOL.allowance(leader.address, leader.address))
            .to.be.revertedWith("DEXLPool: function disabled");
        await expect(POOL.increaseAllowance(leader.address, 100))
            .to.be.revertedWith("DEXLPool: function disabled");
        await expect(POOL.decreaseAllowance(leader.address, 100))
            .to.be.revertedWith("DEXLPool: function disabled");
    });


});