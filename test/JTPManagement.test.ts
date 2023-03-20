import { expect } from 'chai';
import { BytesLike } from 'ethers';
import { ethers, web3 } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { DEXLFactory, DEXLPool, FanToArtistStaking, JTP, JTPManagement } from '../typechain-types/index';
import stableCoinContract from '../contracts/mocks/FiatTokenV2_1.json';
import { PoolReducedStruct } from '../typechain-types/contracts/DEXLFactory';
import { getIndexFromProposal, getPoolFromEvent } from './utils/utils';

describe('JTPManagement', () => {
    let jtp: JTP;
    let jtpManagement: JTPManagement;
    let fanToArtistStaking: FanToArtistStaking;
    let DEXLF: DEXLFactory;
    let owner: SignerWithAddress, addr1: SignerWithAddress, addr2: SignerWithAddress, fakeStaking: SignerWithAddress, fakeDAO: SignerWithAddress;
    let artist1: SignerWithAddress, artist2: SignerWithAddress;
    let adminRole: BytesLike, minterRole: BytesLike, burnerRole: BytesLike, verifyArtistRole: BytesLike;

    before(async () => { //same as deploy
        [owner, addr1, addr2, fakeStaking, fakeDAO, artist1, artist2] = await ethers.getSigners();

        const Pool = await ethers.getContractFactory('DEXLPool');
        const POOLADDRESS = await Pool.deploy() as DEXLPool;
        await POOLADDRESS.deployed();

        const FTAS = await ethers.getContractFactory('FanToArtistStaking');
        fanToArtistStaking = await FTAS.deploy();
        await fanToArtistStaking.deployed();

        const dProp = await ethers.getContractFactory('DEXLFactory');
        DEXLF = await dProp.deploy() as DEXLFactory;
        await DEXLF.deployed();

        const cJTP = await ethers.getContractFactory('JTP');
        jtp = await cJTP.deploy(fakeStaking.address, DEXLF.address);
        await jtp.deployed();
        fanToArtistStaking.initialize(jtp.address, 10, 10, 60, 86400);

        const cJTPManagement = await ethers.getContractFactory('JTPManagement');
        jtpManagement = await cJTPManagement.deploy(jtp.address, fanToArtistStaking.address, DEXLF.address);
        await jtpManagement.deployed();
        await jtp.transferOwnership(jtpManagement.address);
        await fanToArtistStaking.transferOwnership(jtpManagement.address);
        await DEXLF.transferOwnership(jtpManagement.address);
        await DEXLF.initialize(fanToArtistStaking.address, POOLADDRESS.address, jtp.address, 120, 1);


        adminRole = await jtpManagement.DEFAULT_ADMIN_ROLE();
        minterRole = await jtpManagement.MINTER_ROLE();
        burnerRole = await jtpManagement.BURNER_ROLE();
        verifyArtistRole = await jtpManagement.VERIFY_ARTIST_ROLE();
    });

    describe('Deployment', () => {
        it('The owner of JTP should be the JTPManagement contract', async () => {
            expect(await jtp.owner()).to.equal(jtpManagement.address);
        });

        it('The owner of FanToArtistStaking should be the JTPManagement contract', async () => {
            expect(await fanToArtistStaking.owner()).to.equal(jtpManagement.address);
        });

        it('The deployer of the contract should have all the roles', async () => {
            expect(await jtpManagement.hasRole(adminRole, owner.address)).to.be.true;
            expect(await jtpManagement.hasRole(minterRole, owner.address)).to.be.true;
            expect(await jtpManagement.hasRole(burnerRole, owner.address)).to.be.true;
            expect(await jtpManagement.hasRole(verifyArtistRole, owner.address)).to.be.true;
        });
        it('Another user should have no role', async () => {
            expect(await jtpManagement.hasRole(adminRole, addr1.address)).to.be.false;
            expect(await jtpManagement.hasRole(minterRole, addr1.address)).to.be.false;
            expect(await jtpManagement.hasRole(burnerRole, addr1.address)).to.be.false;
            expect(await jtpManagement.hasRole(verifyArtistRole, addr1.address)).to.be.false;
        });
    });

    describe('JTP', () => {
        it('The deployer of JTP should not be able to call a onlyOwner method', async () => {
            await expect(jtp.connect(owner).mint(addr1.address, 10)).to.be.revertedWith('Ownable: caller is not the owner');
        });

        describe('Pausable', () => {
            it('An address without the DEFAULT_ADMIN_ROLE should not be able to pause JTP', async () => {
                await expect(jtpManagement.connect(addr1).pauseJTP())
                    .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${adminRole}`);
            });

            it('An address with the DEFAULT_ADMIN_ROLE should be able to pause JTP', async () => {
                await jtpManagement.connect(owner).pauseJTP();
                expect(await jtp.paused()).to.equal(true);
            });

            it('An address without the DEFAULT_ADMIN_ROLE should not be able to unpause JTP', async () => {
                await expect(jtpManagement.connect(addr1).unpauseJTP())
                    .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${adminRole}`);
            });

            it('An address with the DEFAULT_ADMIN_ROLE should be able to unpause JTP', async () => {
                await jtpManagement.connect(owner).unpauseJTP();
                expect(await jtp.paused()).to.equal(false);
            });

        });

        describe('Minting', () => {
            it('An address with the MINTER_ROLE should be able to mint JTP', async () => {
                await jtpManagement.connect(owner).mint(addr1.address, 10);
                expect(await jtp.balanceOf(addr1.address)).to.equal(10);
            });

            it('An address without the MINTER_ROLE should not be able to mint JTP', async () => {
                await expect(jtpManagement.connect(addr1).mint(addr1.address, 10))
                    .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${minterRole}`);
            });
        });

        describe('Burning', () => {
            before(async () => {
                await jtpManagement.connect(owner).mint(jtpManagement.address, 10);
            });

            it('An address without the BURNERN_ROLE should not be able to burn JTP', async () => {
                await expect(jtpManagement.connect(addr1).burn(10))
                    .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${burnerRole}`);
            });

            it('An address with the BURNERN_ROLE should be able to burn JTP', async () => {
                await jtpManagement.grantRole(burnerRole, addr1.address);
                await jtpManagement.connect(addr1).burn(10);
                expect(await jtp.balanceOf(owner.address)).to.equal(0);
            });
        });

        describe('Burning From', () => {
            before(async () => {
                await jtpManagement.connect(owner).mint(addr2.address, 10);
                await jtp.connect(addr2).approve(jtpManagement.address, 10);
                await jtpManagement.revokeRole(burnerRole, addr1.address);
            });

            it('An address without the BURNERN_ROLE should not be able to burn JTP', async () => {
                await expect(jtpManagement.connect(addr1).burnFrom(addr2.address, 10))
                    .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${burnerRole}`);
            });

            it('An address with the BURNERN_ROLE should be able to burn JTP', async () => {
                await jtpManagement.grantRole(burnerRole, addr1.address);
                await jtpManagement.connect(addr1).burnFrom(addr2.address, 10);
                expect(await jtp.balanceOf(owner.address)).to.equal(0);
            });
        });

        describe('Transfer Ownership', () => {
            it('An address without the DEFAULT_ADMIN_ROLE should not be able to transfer the ownership of JTP contract', async () => {
                await expect(jtpManagement.connect(addr1).transferJTP(fakeDAO.address))
                    .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${adminRole}`);
            });

            it('An address with the DEFAULT_ADMIN_ROLE should be able to transfer the ownership of JTP contract', async () => {
                await jtpManagement.connect(owner).transferJTP(fakeDAO.address);
                expect(await jtp.owner()).to.equal(fakeDAO.address);
            });

            after(async () => {
                await jtp.connect(fakeDAO).transferOwnership(jtpManagement.address);
            });
            // This test work but is redundant, already tested on JTP.js -> Access Control 
            // it('An address with the correct role should not be able to perfom ', async()=>{ 
            //     await expect(jtpManagement.connect(owner).mint(jtpManagement.address, 10)).to.be.revertedWith(`Ownable: caller is not the owner`);
            // });
        });
    });

    describe('FanToArtistStaking', () => {
        describe('Verified Artist', () => {
            before(async () => {
                await jtpManagement.grantRole(verifyArtistRole, addr1.address);
            });

            it('When an artist is added through ftas should emit an event', async () => {
                await expect(jtpManagement.connect(addr1).addArtist(artist1.address))
                    .to.emit(fanToArtistStaking, 'ArtistAdded')//emit event correct
            });

            it('When an artist is removed through ftas should emit an event', async () => {
                await expect(jtpManagement.connect(addr1).removeArtist(artist1.address))
                    .to.emit(fanToArtistStaking, 'ArtistRemoved')//emit event correct
            });

            it('Should revert', async () => {
                await expect(jtpManagement.connect(artist1).addArtist(artist1.address))
                    .to.be.revertedWith(`AccessControl: account ${artist1.address.toLowerCase()} is missing role ${verifyArtistRole}`);
                await expect(jtpManagement.connect(artist1).removeArtist(artist1.address))
                    .to.be.revertedWith(`AccessControl: account ${artist1.address.toLowerCase()} is missing role ${verifyArtistRole}`);
            })
        });

        describe('Transfer Ownership', () => {
            it('An address without the DEFAULT_ADMIN_ROLE should not be able to transfer the ownership of FTAS contract', async () => {
                await expect(jtpManagement.connect(addr1).transferFanToArtistStaking(fakeDAO.address))
                    .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${adminRole}`);
            });

            it('An address with the DEFAULT_ADMIN_ROLE should be able to transfer the ownership of FTAS contract', async () => {
                await jtpManagement.connect(owner).transferFanToArtistStaking(fakeDAO.address);
                expect(await fanToArtistStaking.owner()).to.equal(fakeDAO.address);
            });

            after(async () => {
                await fanToArtistStaking.connect(fakeDAO).transferOwnership(jtpManagement.address);
            });

        });
    });

    describe('DEXLFactory', () => {
        it('Should be able to approve a proposal', async () => {
            const StableCoin = await ethers.getContractFactory(stableCoinContract.abi, stableCoinContract.bytecode);
            const stableCoin = await StableCoin.deploy() as any;
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
            await stableCoin.configureMinter(owner.address, 1000000e6);
            await stableCoin.mint(addr1.address, 1000);
            await stableCoin.connect(addr1).approve(DEXLF.address, 50);
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
            const hash = await getIndexFromProposal(await DEXLF.connect(addr1).proposePool(poolS, "description"));

            await jtpManagement.approveProposal(hash);
        });

        it('Should be able to decline a proposal', async () => {
            const StableCoin = await ethers.getContractFactory(stableCoinContract.abi, stableCoinContract.bytecode);
            const stableCoin = await StableCoin.deploy() as any;
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
            await stableCoin.configureMinter(owner.address, 1000000e6);
            await stableCoin.mint(addr1.address, 1000);
            await stableCoin.connect(addr1).approve(DEXLF.address, 50);
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
            const hash = await getIndexFromProposal(await DEXLF.connect(addr1).proposePool(poolS, "description"));
            await jtpManagement.declineProposal(hash);
        });

        describe('Transfer Ownership', () => {
            it('An address with the DEFAULT_ADMIN_ROLE should be able to transfer the ownership of DEXLFactory contract', async () => {
                await jtpManagement.connect(owner).transferDEXLFactory(fakeDAO.address);
                expect(await DEXLF.owner()).to.equal(fakeDAO.address);
            });
        });

        it('Should be able to call a custom function', async () => {
            const StableCoin = await ethers.getContractFactory(stableCoinContract.abi, stableCoinContract.bytecode);
            const stableCoin = await StableCoin.deploy() as any;
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
            await stableCoin.configureMinter(owner.address, 1000000e6);
            await stableCoin.mint(addr1.address, 1000);
            await stableCoin.connect(addr1).approve(DEXLF.address, 50);
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
            const hash = await getIndexFromProposal(await DEXLF.connect(addr1).proposePool(poolS, "description"));
            const eventi = ((await (await jtpManagement.approveProposal(hash)).wait()).events)?.filter(e => e.address == DEXLF.address).at(0)!;
            let abi = [" event PoolCreated (address indexed leader, address indexed pool, uint256 index)"];
            let iface = new ethers.utils.Interface(abi)
            const pool = (iface.parseLog(eventi)).args['pool'];
            const DEXLPool = (await ethers.getContractFactory("DEXLPool")).attach(pool);
            const calldata = web3.eth.abi.encodeFunctionCall({
                name: 'setLeader',
                type: 'function',
                inputs: [{
                    type: 'address',
                    name: 'leader_'
                }]
            }, [owner.address]);
            expect(await DEXLPool.getLeader()).to.equal(addr1.address);
            await jtpManagement.custom([DEXLPool.address], [calldata]);
            expect(await DEXLPool.getLeader()).to.equal(owner.address);
        });
    });

    describe('Event emitting', () => {
        it('The minting should emit a Mint event', async () => {
            await expect(jtpManagement.connect(owner).mint(addr1.address, 100))
                .to.emit(jtpManagement, 'Mint')
                .withArgs(addr1.address, 100, owner.address);
        });

        it('The burning should emit a Burn event', async () => {
            await jtp.connect(addr1).approve(jtpManagement.address, 100);
            await expect(jtpManagement.connect(owner).burnFrom(addr1.address, 100))
                .to.emit(jtpManagement, 'Burn')
                .withArgs(addr1.address, 100, owner.address);
        });
    });
});