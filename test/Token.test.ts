import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { FanToArtistStaking, Web3MusicNativeToken } from '../typechain-types/index';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { timeMachine } from './utils/utils';
import { BigNumber } from 'ethers';

describe('Web3MusicNativeToken', () => {
    let Web3MusicNativeToken: Web3MusicNativeToken;
    let fanToArtistStaking: FanToArtistStaking;
    let owner: SignerWithAddress, addr1: SignerWithAddress, addr2: SignerWithAddress, addr3: SignerWithAddress,
    addr4: SignerWithAddress, artist1: SignerWithAddress, fakeStaking: SignerWithAddress, fakeDAO: SignerWithAddress;

    const defVeReward = 10;
    const defArtistReward = 10;

    before(async () => {
        [owner, addr1, addr2, addr3, addr4, artist1, fakeStaking, fakeDAO] = await ethers.getSigners();

        const FTAS = await ethers.getContractFactory('FanToArtistStaking');
        fanToArtistStaking = await FTAS.deploy();
        await fanToArtistStaking.deployed();

        const cWeb3MusicNativeToken = await ethers.getContractFactory('Web3MusicNativeToken');
        Web3MusicNativeToken = await cWeb3MusicNativeToken.deploy(fanToArtistStaking.address) as Web3MusicNativeToken;
        await Web3MusicNativeToken.deployed();
        await fanToArtistStaking.initialize(Web3MusicNativeToken.address, 10, 10, 86400, 3, 10);
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
            await expect(cWeb3MusicNativeToken.deploy('0x0000000000000000000000000000000000000000'))
                .to.be.rejectedWith('Web3MusicNativeToken: the address of FanToArtistStaking is 0');
        });

        it('Should not be possible renounce to ownership', async () => {
            await expect(Web3MusicNativeToken.connect(owner).renounceOwnership()).revertedWith("function disabled");
        });

        it('User should not be possible to call renounceOwnership', async () => {
            await expect(Web3MusicNativeToken.connect(addr1).renounceOwnership()).revertedWith("Ownable: caller is not the owner");
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
        describe('Unauthorized access', () => {
            it('Should not be able to lock', async () => {
                await expect(Web3MusicNativeToken.connect(addr1).lock(addr1.address, 100))
                    .to.be.revertedWith('Web3MusicNativeToken: caller is not the FanToArtistStaking contract');
            });
            
            it('Should not be able to payArtist', async () => {
                await expect(Web3MusicNativeToken.connect(addr1).pay(addr1.address, 100))
                    .to.be.revertedWith('Web3MusicNativeToken: caller is not the FanToArtistStaking contract');
            });
        });
    });

    describe('Relesable Payments', () =>{
        it('Release Check', async() => {
            const blockBefore = await ethers.provider.getBlock(await ethers.provider.getBlockNumber());
            await expect(Web3MusicNativeToken.connect(owner).mint_and_lock(addr4.address, BigInt(20*10**18), blockBefore.timestamp, 3600))
                .to.emit(Web3MusicNativeToken, 'Transfer')
                .withArgs('0x0000000000000000000000000000000000000000', addr4.address, BigInt(20*10**18));
            expect(await Web3MusicNativeToken.balanceOf(addr4.address)).to.be.equal(BigInt(20*10**18));
            expect(await Web3MusicNativeToken.releasable(addr4.address)).to.be.closeTo(0, BigInt(1*10**16));
            await timeMachine(60);
            expect(await Web3MusicNativeToken.releasable(addr4.address)).to.be.equal(BigInt(20*10**18));
            expect(await Web3MusicNativeToken.released(addr4.address)).to.be.equal(0);
            await expect(Web3MusicNativeToken.connect(addr4).transfer(owner.address, BigInt(10*10**18)))
                .to.emit(Web3MusicNativeToken, 'Transfer')
                .withArgs(addr4.address, owner.address, BigInt(10*10**18));
            expect(await Web3MusicNativeToken.releasable(addr4.address)).to.be.equal(0);
            expect(await Web3MusicNativeToken.released(addr4.address)).to.be.equal(BigInt(20*10**18));
            expect(await Web3MusicNativeToken.balanceOf(addr4.address)).to.be.equal(BigInt(10*10**18));
        });

        it('Owner should be able to use mint_and lock', async() => {
            const blockBefore = await ethers.provider.getBlock(await ethers.provider.getBlockNumber());
            await expect(Web3MusicNativeToken.connect(owner).mint_and_lock(addr1.address, 100, blockBefore.timestamp, 3600))
                .to.emit(Web3MusicNativeToken, 'Transfer')
                .withArgs('0x0000000000000000000000000000000000000000', addr1.address, 100);
        });

        it('Owner should be able to use transfer_and_lock', async() => {
            const blockBefore = await ethers.provider.getBlock(await ethers.provider.getBlockNumber());
            await Web3MusicNativeToken.connect(owner).mint(owner.address, 100);
            await expect(Web3MusicNativeToken.connect(owner).transfer_and_lock(addr2.address, 100, blockBefore.timestamp, 3600))
                .to.emit(Web3MusicNativeToken, 'Transfer')
                .withArgs(owner.address, addr2.address, 100);
        });

        it('Should not be possible reuse mint_and_lock or transfer_and_lock for the same account', async() => {
            const blockBefore = await ethers.provider.getBlock(await ethers.provider.getBlockNumber());
            await expect(Web3MusicNativeToken.connect(owner).mint_and_lock(addr1.address, 100, blockBefore.timestamp, 3600))
                .to.revertedWith('Web3MusicNativeToken: Releasable payment already used.');
            await Web3MusicNativeToken.connect(owner).mint(owner.address, 100);
            await expect(Web3MusicNativeToken.connect(owner).transfer_and_lock(addr1.address, 100, blockBefore.timestamp, 3600))
                .to.revertedWith('Web3MusicNativeToken: Releasable payment already used.');
            await Web3MusicNativeToken.connect(owner).burn(100);
        });

        it('A holder of locked tokens should not be able to spend it', async() => {
             await expect(Web3MusicNativeToken.connect(addr1).transfer(owner.address, 100))
                .to.revertedWith('Web3MusicNativeToken: transfer amount exceeds balance');
        });

        it('A holder of locked tokens should be able to spend it after a while', async() => {
            await timeMachine(30);
            expect(await Web3MusicNativeToken.releasable(addr1.address)).to.be.equal(50);
            await expect(Web3MusicNativeToken.connect(addr1).transfer(owner.address, 51))
                .to.revertedWith('Web3MusicNativeToken: transfer amount exceeds balance');
            await expect(Web3MusicNativeToken.connect(addr1).transfer(owner.address, 50))
                .to.emit(Web3MusicNativeToken, 'Transfer')
                .withArgs(addr1.address, owner.address, 50);
        });

        it('Owner should not be able to burn locked token', async() => {
            await Web3MusicNativeToken.connect(addr1).approve(owner.address, 50);
            await expect(Web3MusicNativeToken.connect(owner).burnFrom(addr1.address, 50))
               .to.revertedWith('Web3MusicNativeToken: transfer amount exceeds balance');
            await timeMachine(30);
            await expect(Web3MusicNativeToken.connect(owner).burnFrom(addr1.address, 50))
                .to.emit(Web3MusicNativeToken, 'Transfer')
                .withArgs(addr1.address, '0x0000000000000000000000000000000000000000', 50);
                expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.be.equal(0);
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
            await Web3MusicNativeToken.transferOwnership(fakeDAO.address);
            await expect(Web3MusicNativeToken.connect(fakeDAO).acceptOwnership())
                .to.emit(Web3MusicNativeToken, 'OwnershipTransferred')
                .withArgs(owner.address, fakeDAO.address);
        });
    });
});
