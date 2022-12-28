import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { JTP } from '../typechain-types/index';

describe('JTP', () => {
    let jtp: JTP;
    let owner: SignerWithAddress, addr1: SignerWithAddress, addr2: SignerWithAddress;

    before(async () => {
        const cJTP = await ethers.getContractFactory('JTP');
        jtp = await cJTP.deploy() as JTP;
        await jtp.deployed();
        [owner, addr1, addr2] = await ethers.getSigners();
    });

    describe('Deployment', () => {
        it('Should set the right owner', async () => {
            expect(await jtp.owner()).to.equal(owner.address);
        });

        it('TotalSupply should be zero', async () => {
            expect(await jtp.totalSupply()).to.equal(0);
        });
    });

    describe('Access control', () => {
        it('Only the owner should be able to call the mint', async () => {
            await jtp.connect(owner).mint(owner.address, 1);
            expect(await jtp.totalSupply()).to.equal(await jtp.balanceOf(owner.address));

            await expect(jtp.connect(addr1).mint(addr1.address, 1)).to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('Only the owner should be able to call the burn', async () => {
            await expect(jtp.connect(addr1).burn(1)).to.be.revertedWith('Ownable: caller is not the owner');

            await jtp.connect(owner).burn(1);
            expect(await jtp.totalSupply()).to.equal(await jtp.balanceOf(owner.address));
        });

        it('Only the owner should be able to call the burnFrom', async () => {
            await expect(jtp.connect(addr1).burn(1)).to.be.revertedWith('Ownable: caller is not the owner');
        });

    });

    describe('Behaviour', () => {
        it('TotalSupply should increase as we mint', async () => {
            await jtp.connect(owner).mint(addr1.address, 100);

            expect(await jtp.totalSupply()).to.equal(await jtp.balanceOf(addr1.address));
        });

        it('TotalSupply should decrease as we burn', async () => {
            await jtp.connect(addr1).approve(owner.address, 100);
            await jtp.connect(owner).burnFrom(addr1.address, 100);

            expect(await jtp.totalSupply()).to.equal(await jtp.balanceOf(addr1.address)).to.equal(0);
        });
    });

    describe('Event emitting', () => {
        it('TotalSupply should increase as we mint', async () => {
            await jtp.connect(owner).mint(addr1.address, 100);

            expect(await jtp.totalSupply()).to.equal(await jtp.balanceOf(addr1.address));
        });
    });
});