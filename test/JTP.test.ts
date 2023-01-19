import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { JTP } from '../typechain-types/index';

describe('JTP', () => {
    let jtp: JTP;
    let owner: SignerWithAddress, addr1: SignerWithAddress, fakeStaking: SignerWithAddress, fakeDAO: SignerWithAddress;

    before(async () => {
        [owner, addr1, fakeStaking, fakeDAO] = await ethers.getSigners();

        const cJTP = await ethers.getContractFactory('JTP');
        jtp = await cJTP.deploy(fakeStaking.address) as JTP;
        await jtp.deployed();
    });

    describe('Deployment', () => {
        it('Should set the right owner', async () => {
            expect(await jtp.owner()).to.equal(owner.address);
        });

        it('TotalSupply should be zero', async () => {
            expect(await jtp.totalSupply()).to.equal(0);
        });

        it('Should revert if the FanToArtistStaking address is 0', async () => {
            const cJTP = await ethers.getContractFactory('JTP');
            await expect(cJTP.deploy('0x0000000000000000000000000000000000000000'))
                .to.be.rejectedWith('JTP: the address of FanToArtistStaking is 0');
        });
    });

    describe('Access control', () => {
        it('Only the owner should be able to call the mint', async () => {
            await jtp.connect(owner).mint(owner.address, 1);
            expect(await jtp.totalSupply()).to.equal(await jtp.balanceOf(owner.address));

            await expect(jtp.connect(addr1).mint(addr1.address, 1))
                .to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('Only the owner should be able to call the burn', async () => {
            await expect(jtp.connect(addr1).burn(1))
                .to.be.revertedWith('Ownable: caller is not the owner');

            await jtp.connect(owner).burn(1);
            expect(await jtp.totalSupply()).to.equal(await jtp.balanceOf(owner.address));
        });

        it('Only the owner should be able to call the burnFrom', async () => {
            await expect(jtp.connect(addr1).burnFrom(addr1.address, 1))
                .to.be.revertedWith('Ownable: caller is not the owner');
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

        it('Should revert if the minter is not the owner', async () => {
            await expect(jtp.connect(addr1).mint(addr1.address, 100))
                .to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('Should revert if the burner is not the owner', async () => {
            await expect(jtp.connect(addr1).burn(100))
                .to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('Should revert if the burner is not the owner', async () => {
            await expect(jtp.connect(addr1).burnFrom(addr1.address, 100))
                .to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('Should revert if is not the the owner to call the transfer', async () => {
            await expect(jtp.connect(addr1).transferOwnership(addr1.address))
                .to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('Pause/Unpause', async () => {
            await jtp.connect(owner).pause();
            await expect(jtp.connect(owner).pause())
                .to.be.revertedWith('Pausable: paused');
            await expect(jtp.connect(owner).mint(addr1.address, 100))
                .to.be.revertedWith('Pausable: paused');
            await jtp.connect(owner).unpause();
            await expect(jtp.connect(owner).unpause())
                .to.be.revertedWith('Pausable: not paused');
            await expect(jtp.connect(addr1).pause())
                .to.be.revertedWith('Ownable: caller is not the owner');
            await expect(jtp.connect(addr1).unpause())
                .to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('Should not allow to burnFrom without allowance', async () => {
            await expect(jtp.connect(owner).burnFrom(addr1.address, 100))
                .to.be.revertedWith('ERC20: insufficient allowance');
        });
    });

    describe('Lock & Unlock', () => {
        before(async () => {
            await jtp.mint(addr1.address, 100);
        });

        it('User should be able to lock', async () => {
            await jtp.connect(fakeStaking).lock(addr1.address, 100);

            expect(await jtp.balanceOf(addr1.address)).to.equal(0);
            expect(await jtp.balanceOf(fakeStaking.address)).to.equal(100);
        });

        it('User should be able to unlock', async () => {
            await jtp.connect(fakeStaking).unlock(addr1.address, 100);

            expect(await jtp.balanceOf(addr1.address)).to.equal(100);
            expect(await jtp.balanceOf(fakeStaking.address)).to.equal(0);
        });

        describe('Unauthorized access', () => {
            it('Should not be able to lock', async () => {
                await expect(jtp.connect(addr1).lock(addr1.address, 100))
                    .to.be.revertedWith('JTP: caller is not the FanToArtistStaking contract');
            });
            it('Should not be able to unlock', async () => {
                await expect(jtp.connect(addr1).unlock(addr1.address, 100))
                    .to.be.revertedWith('JTP: caller is not the FanToArtistStaking contract');
            });
            it('Should not be able to payArtist', async () => {
                await expect(jtp.connect(addr1).payArtist(addr1.address, 100))
                    .to.be.revertedWith('JTP: caller is not the FanToArtistStaking contract');
            });
        });
    });

    describe('Event emitting', () => {
        it('The minting should emit an event', async () => {
            await expect(jtp.connect(owner).mint(addr1.address, 100))
                .to.emit(jtp, 'Transfer')
                .withArgs('0x0000000000000000000000000000000000000000', addr1.address, 100);
        });

        it('The token transfer should emit an event', async () => {
            await expect(jtp.connect(addr1).transfer(owner.address, 100))
                .to.emit(jtp, 'Transfer')
                .withArgs(addr1.address, owner.address, 100);
        });

        it('The burn should emit an event', async () => {
            await expect(jtp.connect(owner).burn(100))
                .to.emit(jtp, 'Transfer')
                .withArgs(owner.address, '0x0000000000000000000000000000000000000000', 100);
        });

        it('The transfer of ownership should emit an event', async () => {
            await expect(jtp.transferOwnership(fakeDAO.address))
                .to.emit(jtp, 'OwnershipTransferred')
                .withArgs(owner.address, fakeDAO.address);
        });

    });
});