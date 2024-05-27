import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { ArtistStaking, MusicProtocolRECORDToken } from '../typechain-types/index';
import { timeMachine, getTimestamp } from './utils/utils';

describe('MusicProtocolRECORDToken', () => {
    let MusicProtocolRECORDToken: MusicProtocolRECORDToken;
    let ArtistStaking: ArtistStaking;
    let owner: SignerWithAddress, addr1: SignerWithAddress, addr2: SignerWithAddress, addr3: SignerWithAddress,
        addr4: SignerWithAddress, artist1: SignerWithAddress, fakeStaking: SignerWithAddress, fakeDAO: SignerWithAddress;

    before(async () => {
        [owner, addr1, addr2, addr3, addr4, artist1, fakeStaking, fakeDAO] = await ethers.getSigners();

        const FTAS = await ethers.getContractFactory('ArtistStaking');
        ArtistStaking = await upgrades.deployProxy(FTAS.connect(owner), [], { initializer: false, kind: 'uups', timeout: 180000 }) as unknown as ArtistStaking;
        await ArtistStaking.deployed;

        const cMusicProtocolRECORDToken = await ethers.getContractFactory('MusicProtocolRECORDToken');
        MusicProtocolRECORDToken = await cMusicProtocolRECORDToken.deploy(ArtistStaking.address) as MusicProtocolRECORDToken;
        await MusicProtocolRECORDToken.deployed();
        await ArtistStaking.initialize(MusicProtocolRECORDToken.address, 10, 10, 86400, 3, 600);
    });

    describe('Deployment', () => {
        it('Should set the right owner', async () => {
            expect(await MusicProtocolRECORDToken.owner()).to.equal(owner.address);
        });

        it('TotalSupply should be zero', async () => {
            expect(await MusicProtocolRECORDToken.totalSupply()).to.equal(0);
        });

        it('Should revert if the ArtistStaking address is 0', async () => {
            const cMusicProtocolRECORDToken = await ethers.getContractFactory('MusicProtocolRECORDToken');
            await expect(cMusicProtocolRECORDToken.deploy('0x0000000000000000000000000000000000000000'))
                .to.be.rejectedWith('MusicProtocolRECORDToken: the address of ArtistStaking is 0');
        });

        it('Should not be possible renounce to ownership', async () => {
            await expect(MusicProtocolRECORDToken.connect(owner).renounceOwnership()).revertedWith("MusicProtocolRECORDToken: function disabled");
        });

        it('User should not be possible to call renounceOwnership', async () => {
            await expect(MusicProtocolRECORDToken.connect(addr1).renounceOwnership()).revertedWith("Ownable: caller is not the owner");
        });
    });

    describe('Access control', () => {
        it('Only the owner should be able to call the mint', async () => {
            await MusicProtocolRECORDToken.connect(owner).mint(owner.address, 1);
            expect(await MusicProtocolRECORDToken.totalSupply()).to.equal(await MusicProtocolRECORDToken.balanceOf(owner.address));

            await expect(MusicProtocolRECORDToken.connect(addr1).mint(addr1.address, 1))
                .to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('Only the owner should be able to call the burn', async () => {
            await expect(MusicProtocolRECORDToken.connect(addr1).burn(1))
                .to.be.revertedWith('Ownable: caller is not the owner');

            await MusicProtocolRECORDToken.connect(owner).burn(1);
            expect(await MusicProtocolRECORDToken.totalSupply()).to.equal(await MusicProtocolRECORDToken.balanceOf(owner.address));
        });

        it('Only the owner should be able to call the burnFrom', async () => {
            await expect(MusicProtocolRECORDToken.connect(addr1).burnFrom(addr1.address, 1))
                .to.be.revertedWith('Ownable: caller is not the owner');
        });
    });

    describe('Behaviour', () => {
        it('TotalSupply should increase as we mint', async () => {
            await MusicProtocolRECORDToken.connect(owner).mint(addr1.address, 100);

            expect(await MusicProtocolRECORDToken.totalSupply()).to.equal(await MusicProtocolRECORDToken.balanceOf(addr1.address));
        });

        it('TotalSupply should decrease as we burn', async () => {
            await MusicProtocolRECORDToken.connect(addr1).approve(owner.address, 100);
            await MusicProtocolRECORDToken.connect(owner).burnFrom(addr1.address, 100);

            expect(await MusicProtocolRECORDToken.totalSupply()).to.equal(await MusicProtocolRECORDToken.balanceOf(addr1.address)).to.equal(0);
        });

        it('Should revert if the minter is not the owner', async () => {
            await expect(MusicProtocolRECORDToken.connect(addr1).mint(addr1.address, 100))
                .to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('Should revert if the burner is not the owner', async () => {
            await expect(MusicProtocolRECORDToken.connect(addr1).burn(100))
                .to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('Should revert if the burner is not the owner', async () => {
            await expect(MusicProtocolRECORDToken.connect(addr1).burnFrom(addr1.address, 100))
                .to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('Should revert if is not the the owner to call the transfer', async () => {
            await expect(MusicProtocolRECORDToken.connect(addr1).transferOwnership(addr1.address))
                .to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('Pause/Unpause', async () => {
            await MusicProtocolRECORDToken.connect(owner).pause();
            await expect(MusicProtocolRECORDToken.connect(owner).pause())
                .to.be.revertedWith('Pausable: paused');
            await expect(MusicProtocolRECORDToken.connect(owner).mint(addr1.address, 100))
                .to.be.revertedWith('Pausable: paused');
            await MusicProtocolRECORDToken.connect(owner).unpause();
            await expect(MusicProtocolRECORDToken.connect(owner).unpause())
                .to.be.revertedWith('Pausable: not paused');
            await expect(MusicProtocolRECORDToken.connect(addr1).pause())
                .to.be.revertedWith('Ownable: caller is not the owner');
            await expect(MusicProtocolRECORDToken.connect(addr1).unpause())
                .to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('Should not allow to burnFrom without allowance', async () => {
            await expect(MusicProtocolRECORDToken.connect(owner).burnFrom(addr1.address, 100))
                .to.be.revertedWith('ERC20: insufficient allowance');
        });
    });

    describe('Lock & Unlock', () => {
        describe('Unauthorized access', () => {
            it('Should not be able to lock', async () => {
                await expect(MusicProtocolRECORDToken.connect(addr1).lock(addr1.address, 100))
                    .to.be.revertedWith('MusicProtocolRECORDToken: caller is not the ArtistStaking contract');
            });

            it('Should not be able to payArtist', async () => {
                await expect(MusicProtocolRECORDToken.connect(addr1).pay(addr1.address, 100))
                    .to.be.revertedWith('MusicProtocolRECORDToken: caller is not the ArtistStaking contract');
            });
        });
    });

    describe('Relesable Payments', () => {
        it('Release Check', async () => {
            await expect(MusicProtocolRECORDToken.connect(owner).mint_and_lock(addr4.address, BigInt(20 * 10 ** 18), await getTimestamp(), 3600))
                .to.emit(MusicProtocolRECORDToken, 'Transfer')
                .withArgs('0x0000000000000000000000000000000000000000', addr4.address, BigInt(20 * 10 ** 18));
            expect(await MusicProtocolRECORDToken.balanceOf(addr4.address)).to.be.equal(BigInt(20 * 10 ** 18));
            expect(await MusicProtocolRECORDToken.releasable(addr4.address)).to.be.closeTo(0, BigInt(1 * 10 ** 16));
            await timeMachine(60);
            expect(await MusicProtocolRECORDToken.releasable(addr4.address)).to.be.equal(BigInt(20 * 10 ** 18));
            expect(await MusicProtocolRECORDToken.released(addr4.address)).to.be.equal(0);
            await expect(MusicProtocolRECORDToken.connect(addr4).transfer(owner.address, BigInt(10 * 10 ** 18)))
                .to.emit(MusicProtocolRECORDToken, 'Transfer')
                .withArgs(addr4.address, owner.address, BigInt(10 * 10 ** 18));
            expect(await MusicProtocolRECORDToken.releasable(addr4.address)).to.be.equal(0);
            expect(await MusicProtocolRECORDToken.released(addr4.address)).to.be.equal(BigInt(20 * 10 ** 18));
            expect(await MusicProtocolRECORDToken.balanceOf(addr4.address)).to.be.equal(BigInt(10 * 10 ** 18));
        });

        it('Owner should be able to use mint_and lock', async () => {
            await expect(MusicProtocolRECORDToken.connect(owner).mint_and_lock(addr1.address, 100, await getTimestamp(), 3600))
                .to.emit(MusicProtocolRECORDToken, 'Transfer')
                .withArgs('0x0000000000000000000000000000000000000000', addr1.address, 100);
        });

        it('Owner should be able to use transfer_and_lock', async () => {
            await MusicProtocolRECORDToken.connect(owner).mint(owner.address, 100);
            //If you want to transfer_and_block through the token contract, you need to approve the amount of tokens at your address
            await expect(MusicProtocolRECORDToken.connect(owner).approve(owner.address, 100))
                .to.emit(MusicProtocolRECORDToken, "Approval")
                .withArgs(owner.address, owner.address, 100);
            await expect(MusicProtocolRECORDToken.transfer_and_lock(owner.address, addr2.address, 100, await getTimestamp(), 3600))
                .to.emit(MusicProtocolRECORDToken, 'Transfer')
                .withArgs(owner.address, addr2.address, 100);
        });

        it('Should not be possible reuse mint_and_lock or transfer_and_lock for the same account', async () => {
            await expect(MusicProtocolRECORDToken.connect(owner).mint_and_lock(addr1.address, 100, await getTimestamp(), 3600))
                .to.revertedWith('MusicProtocolRECORDToken: Releasable payment already used.');
            await MusicProtocolRECORDToken.connect(owner).mint(owner.address, 100);
            await MusicProtocolRECORDToken.connect(owner).approve(owner.address, 100);
            await expect(MusicProtocolRECORDToken.connect(owner).transfer_and_lock(owner.address, addr1.address, 100, await getTimestamp(), 3600))
                .to.revertedWith('MusicProtocolRECORDToken: Releasable payment already used.');
            await MusicProtocolRECORDToken.connect(owner).burn(100);
        });

        it('A holder of locked tokens should not be able to spend it', async () => {
            await expect(MusicProtocolRECORDToken.connect(addr1).transfer(owner.address, 100))
                .to.revertedWith('MusicProtocolRECORDToken: transfer amount exceeds balance');
        });

        it('A holder of locked tokens should be able to spend it after a while', async () => {
            await timeMachine(30);
            expect(await MusicProtocolRECORDToken.releasable(addr1.address)).to.be.equal(50);
            await expect(MusicProtocolRECORDToken.connect(addr1).transfer(owner.address, 51))
                .to.revertedWith('MusicProtocolRECORDToken: transfer amount exceeds balance');
            await expect(MusicProtocolRECORDToken.connect(addr1).transfer(owner.address, 50))
                .to.emit(MusicProtocolRECORDToken, 'Transfer')
                .withArgs(addr1.address, owner.address, 50);
        });

        it('Owner should not be able to burn locked token', async () => {
            await MusicProtocolRECORDToken.connect(addr1).approve(owner.address, 50);
            await expect(MusicProtocolRECORDToken.connect(owner).burnFrom(addr1.address, 50))
                .to.revertedWith('MusicProtocolRECORDToken: transfer amount exceeds balance');
            await timeMachine(30);
            await expect(MusicProtocolRECORDToken.connect(owner).burnFrom(addr1.address, 50))
                .to.emit(MusicProtocolRECORDToken, 'Transfer')
                .withArgs(addr1.address, '0x0000000000000000000000000000000000000000', 50);
            expect(await MusicProtocolRECORDToken.balanceOf(addr1.address)).to.be.equal(0);
        });
    });

    describe('Event emitting', () => {
        it('The minting should emit an event', async () => {
            await expect(MusicProtocolRECORDToken.connect(owner).mint(addr1.address, 100))
                .to.emit(MusicProtocolRECORDToken, 'Transfer')
                .withArgs('0x0000000000000000000000000000000000000000', addr1.address, 100);
        });

        it('The token transfer should emit an event', async () => {
            await expect(MusicProtocolRECORDToken.connect(addr1).transfer(owner.address, 100))
                .to.emit(MusicProtocolRECORDToken, 'Transfer')
                .withArgs(addr1.address, owner.address, 100);
        });

        it('The burn should emit an event', async () => {
            await expect(MusicProtocolRECORDToken.connect(owner).burn(100))
                .to.emit(MusicProtocolRECORDToken, 'Transfer')
                .withArgs(owner.address, '0x0000000000000000000000000000000000000000', 100);
        });

        it('The transfer of ownership should emit an event', async () => {
            await MusicProtocolRECORDToken.transferOwnership(fakeDAO.address);
            await expect(MusicProtocolRECORDToken.connect(fakeDAO).acceptOwnership())
                .to.emit(MusicProtocolRECORDToken, 'OwnershipTransferred')
                .withArgs(owner.address, fakeDAO.address);
        });
    });
});
