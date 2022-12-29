import { expect } from 'chai';
import { BytesLike } from 'ethers';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { FanToArtistStaking, JTP, JTPManagement } from '../typechain-types/index';

describe('JTPManagement', () => {
    let jtp: JTP;
    let jtpManagement: JTPManagement;
    let fanToArtistStaking: FanToArtistStaking;
    let owner: SignerWithAddress, addr1: SignerWithAddress, fakeStaking: SignerWithAddress, fakeDAO: SignerWithAddress;
    let artist1: SignerWithAddress, artist2: SignerWithAddress;
    let adminRole: BytesLike, minterRole: BytesLike, burnerRole: BytesLike, verifyArtistRole: BytesLike;

    before(async () => { //same as deploy
        [owner, addr1, fakeStaking, fakeDAO, artist1, artist2] = await ethers.getSigners();

        const FTAS = await ethers.getContractFactory("FanToArtistStaking");
        fanToArtistStaking = await FTAS.deploy();
        await fanToArtistStaking.deployed();

        const cJTP = await ethers.getContractFactory('JTP');
        jtp = await cJTP.deploy(fakeStaking.address);
        await jtp.deployed();

        const cJTPManagement = await ethers.getContractFactory("JTPManagement");
        jtpManagement = await cJTPManagement.deploy(jtp.address, fanToArtistStaking.address);
        await jtpManagement.deployed();
        await jtp.transferOwnership(jtpManagement.address);
        await fanToArtistStaking.transferOwnership(jtpManagement.address);

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
            await expect(jtp.connect(owner).mint(addr1.address, 10)).to.revertedWith('Ownable: caller is not the owner');
        });

        describe('Minting', () => {
            it('An address with the MINTER_ROLE should be able to mint JTP', async () => {
                await jtpManagement.connect(owner).mint(addr1.address, 10);
                expect(await jtp.balanceOf(addr1.address)).to.equal(10);
            });

            it('An address without the MINTER_ROLE should not be able to mint JTP', async () => {
                await expect(jtpManagement.connect(addr1).mint(addr1.address, 10))
                    .to.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${minterRole}`);
            });
        });

        describe('Burning', () => {
            before(async () => {
                await jtpManagement.connect(owner).mint(jtpManagement.address, 10);
            });

            it('An address without the BURNERN_ROLE should not be able to burn JTP', async () => {
                await expect(jtpManagement.connect(addr1).burn(10))
                    .to.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${burnerRole}`);
            });

            it('An address with the BURNERN_ROLE should be able to burn JTP', async () => {
                await jtpManagement.grantRole(burnerRole, addr1.address);
                await jtpManagement.connect(addr1).burn(10);
                expect(await jtp.balanceOf(owner.address)).to.equal(0);
            });
        });

        describe('Transfer Ownership', () => {
            it('An address without the DEFAULT_ADMIN_ROLE should not be able to transfer the ownership of JTP contract', async () => {
                await expect(jtpManagement.connect(addr1).transferJTP(fakeDAO.address))
                    .to.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${adminRole}`);
            });

            it('An address with the DEFAULT_ADMIN_ROLE should be able to transfer the ownership of JTP contract', async () => {
                await jtpManagement.connect(owner).transferJTP(fakeDAO.address);
                expect(await jtp.owner()).to.equal(fakeDAO.address);
            });

            // This test work but is redundant, already tested on JTP.js -> Access Control 
            // it('An address with the correct role should not be able to perfom ', async()=>{ 
            //     await expect(jtpManagement.connect(owner).mint(jtpManagement.address, 10)).to.revertedWith(`Ownable: caller is not the owner`);
            // });
        });
    });

    describe('FanToArtistStaking', () => {
        before(async () => {
            await jtpManagement.grantRole(verifyArtistRole, addr1.address);
        });

        it('When an artist is added through ftas should emit an event', async () => {
            await expect(jtpManagement.connect(addr1).addArtist(artist1.address))
                .to.emit(fanToArtistStaking, "ArtistAdded")//emit event correct
        });

        it('When an artist is removed through ftas should emit an event', async () => {
            await expect(jtpManagement.connect(addr1).removeArtist(artist1.address))
                .to.emit(fanToArtistStaking, "ArtistRemoved")//emit event correct
        });
    });
});