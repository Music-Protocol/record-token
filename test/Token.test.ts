import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Web3MusicNativeToken } from '../typechain-types/index';

describe('Web3MusicNativeToken', () => {
    let Web3MusicNativeToken: Web3MusicNativeToken;
    let owner: SignerWithAddress, addr1: SignerWithAddress, fakeStaking: SignerWithAddress, fakeDAO: SignerWithAddress;

    before(async () => {
        [owner, addr1, fakeStaking, fakeDAO] = await ethers.getSigners();

        const cWeb3MusicNativeToken = await ethers.getContractFactory('Web3MusicNativeToken');
        Web3MusicNativeToken = await cWeb3MusicNativeToken.deploy(fakeStaking.address, fakeStaking.address) as Web3MusicNativeToken;
        await Web3MusicNativeToken.deployed();
    });

    describe('Deployment', () => {
        it('Should set the right owner', async () => {
            expect(await Web3MusicNativeToken.owner()).to.equal(owner.address);
        });

        it('TotalSupply should be zero', async () => {
            expect(await Web3MusicNativeToken.totalSupply()).to.equal(0);
        });

        it('Should revert if the FanToArtistStaking address is 0', async () => {
            const cWeb3MusicNativeToken = await ethers.getContractFactory('Web3MusicNativeToken');
            await expect(cWeb3MusicNativeToken.deploy('0x0000000000000000000000000000000000000000', fakeStaking.address))
                .to.be.rejectedWith('Web3MusicNativeToken: the address of FanToArtistStaking is 0');
        });
    });

    describe('Access control', () => {
        it('Only the owner should be able to call the mint', async () => {
            await Web3MusicNativeToken.connect(owner).mint(owner.address, 1);
            expect(await Web3MusicNativeToken.totalSupply()).to.equal(await Web3MusicNativeToken.balanceOf(owner.address));

            await expect(Web3MusicNativeToken.connect(addr1).mint(addr1.address, 1))
                .to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('Only the owner should be able to call the burn', async () => {
            await expect(Web3MusicNativeToken.connect(addr1).burn(1))
                .to.be.revertedWith('Ownable: caller is not the owner');

            await Web3MusicNativeToken.connect(owner).burn(1);
            expect(await Web3MusicNativeToken.totalSupply()).to.equal(await Web3MusicNativeToken.balanceOf(owner.address));
        });

        it('Only the owner should be able to call the burnFrom', async () => {
            await expect(Web3MusicNativeToken.connect(addr1).burnFrom(addr1.address, 1))
                .to.be.revertedWith('Ownable: caller is not the owner');
        });
    });

    describe('Behaviour', () => {
        it('TotalSupply should increase as we mint', async () => {
            await Web3MusicNativeToken.connect(owner).mint(addr1.address, 100);

            expect(await Web3MusicNativeToken.totalSupply()).to.equal(await Web3MusicNativeToken.balanceOf(addr1.address));
        });

        it('TotalSupply should decrease as we burn', async () => {
            await Web3MusicNativeToken.connect(addr1).approve(owner.address, 100);
            await Web3MusicNativeToken.connect(owner).burnFrom(addr1.address, 100);

            expect(await Web3MusicNativeToken.totalSupply()).to.equal(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(0);
        });

        it('Should revert if the minter is not the owner', async () => {
            await expect(Web3MusicNativeToken.connect(addr1).mint(addr1.address, 100))
                .to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('Should revert if the burner is not the owner', async () => {
            await expect(Web3MusicNativeToken.connect(addr1).burn(100))
                .to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('Should revert if the burner is not the owner', async () => {
            await expect(Web3MusicNativeToken.connect(addr1).burnFrom(addr1.address, 100))
                .to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('Should revert if is not the the owner to call the transfer', async () => {
            await expect(Web3MusicNativeToken.connect(addr1).transferOwnership(addr1.address))
                .to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('Pause/Unpause', async () => {
            await Web3MusicNativeToken.connect(owner).pause();
            await expect(Web3MusicNativeToken.connect(owner).pause())
                .to.be.revertedWith('Pausable: paused');
            await expect(Web3MusicNativeToken.connect(owner).mint(addr1.address, 100))
                .to.be.revertedWith('Pausable: paused');
            await Web3MusicNativeToken.connect(owner).unpause();
            await expect(Web3MusicNativeToken.connect(owner).unpause())
                .to.be.revertedWith('Pausable: not paused');
            await expect(Web3MusicNativeToken.connect(addr1).pause())
                .to.be.revertedWith('Ownable: caller is not the owner');
            await expect(Web3MusicNativeToken.connect(addr1).unpause())
                .to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('Should not allow to burnFrom without allowance', async () => {
            await expect(Web3MusicNativeToken.connect(owner).burnFrom(addr1.address, 100))
                .to.be.revertedWith('ERC20: insufficient allowance');
        });
    });

    describe('Lock & Unlock', () => {
        before(async () => {
            await Web3MusicNativeToken.mint(addr1.address, 100);
        });

        it('User should be able to lock', async () => {
            await Web3MusicNativeToken.connect(fakeStaking).lock(addr1.address, 100);

            expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(0);
            expect(await Web3MusicNativeToken.balanceOf(fakeStaking.address)).to.equal(100);
        });

        // it('User should be able to unlock', async () => {
        //     await Web3MusicNativeToken.connect(fakeStaking).unlock(addr1.address, 100);

        //     expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(100);
        //     expect(await Web3MusicNativeToken.balanceOf(fakeStaking.address)).to.equal(0);
        // });

        describe('Unauthorized access', () => {
            it('Should not be able to lock', async () => {
                await expect(Web3MusicNativeToken.connect(addr1).lock(addr1.address, 100))
                    .to.be.revertedWith('Web3MusicNativeToken: caller is not the FanToArtistStaking contract');
            });
            // it('Should not be able to unlock', async () => {
            //     await expect(Web3MusicNativeToken.connect(addr1).unlock(addr1.address, 100))
            //         .to.be.revertedWith('Web3MusicNativeToken: caller is not the FanToArtistStaking contract');
            // });
            it('Should not be able to payArtist', async () => {
                await expect(Web3MusicNativeToken.connect(addr1).pay(addr1.address, 100))
                    .to.be.revertedWith('Web3MusicNativeToken: caller is not the FanToArtistStaking contract');
            });
        });
    });

    describe('Event emitting', () => {
        it('The minting should emit an event', async () => {
            await expect(Web3MusicNativeToken.connect(owner).mint(addr1.address, 100))
                .to.emit(Web3MusicNativeToken, 'Transfer')
                .withArgs('0x0000000000000000000000000000000000000000', addr1.address, 100);
        });

        it('The token transfer should emit an event', async () => {
            await expect(Web3MusicNativeToken.connect(addr1).transfer(owner.address, 100))
                .to.emit(Web3MusicNativeToken, 'Transfer')
                .withArgs(addr1.address, owner.address, 100);
        });

        it('The burn should emit an event', async () => {
            await expect(Web3MusicNativeToken.connect(owner).burn(100))
                .to.emit(Web3MusicNativeToken, 'Transfer')
                .withArgs(owner.address, '0x0000000000000000000000000000000000000000', 100);
        });

        it('The transfer of ownership should emit an event', async () => {
            await expect(Web3MusicNativeToken.transferOwnership(fakeDAO.address))
                .to.emit(Web3MusicNativeToken, 'OwnershipTransferred')
                .withArgs(owner.address, fakeDAO.address);
        });

    });
});