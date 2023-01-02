import { expect } from 'chai';
import { BytesLike } from 'ethers';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { FanToArtistStaking, JTP, JTPManagement } from '../typechain-types/index';

describe('FanToArtistStaking', () => {
    let jtp: JTP;
    let fanToArtistStaking: FanToArtistStaking;
    let owner: SignerWithAddress, addr1: SignerWithAddress, addr2: SignerWithAddress, addr3: SignerWithAddress, artist1: SignerWithAddress, artist2: SignerWithAddress;

    before(async () => {
        [owner, addr1, addr2, addr3, artist1, artist2] = await ethers.getSigners();

        const FTAS = await ethers.getContractFactory('FanToArtistStaking');
        fanToArtistStaking = await FTAS.deploy(10, 10);
        await fanToArtistStaking.deployed();

        const cJTP = await ethers.getContractFactory('JTP');
        jtp = await cJTP.deploy(fanToArtistStaking.address);
        await jtp.deployed();
        await fanToArtistStaking.setJTP(jtp.address);
    });

    describe('Deployment', () => {
        it('Should set the right owner', async () => {
            expect(await jtp.owner()).to.equal(owner.address);
        });

        it('Should not allow to change the address of JTP contract', async () => {
            await expect(fanToArtistStaking.setJTP(addr3.address))
                .to.be.revertedWith('FanToArtistStaking: JTP contract already linked');
        });
    });

    describe('Verified Artist', () => {
        it('Should add the right artist to the verifiedArtists list and emit an event', async () => {
            await expect(fanToArtistStaking.addArtist(artist1.address, addr1.address))
                .to.emit(fanToArtistStaking, 'ArtistAdded')
                .withArgs(artist1.address, addr1.address);

            expect(await fanToArtistStaking.isVerified(artist1.address)).to.equal(true);
        });

        it('Should remove the right artist to the verifiedArtists list and emit an event', async () => {
            await expect(fanToArtistStaking.removeArtist(artist1.address, addr1.address))
                .to.emit(fanToArtistStaking, 'ArtistRemoved')
                .withArgs(artist1.address, addr1.address);

            expect(await fanToArtistStaking.isVerified(artist1.address)).to.equal(false);
        });

        it('Should return an error if the caller is not the owner', async () => {
            await expect(fanToArtistStaking.connect(addr2).addArtist(artist1.address, addr1.address))
                .to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('Should return an error if the caller is not the owner', async () => {
            await expect(fanToArtistStaking.connect(addr2).removeArtist(artist1.address, addr1.address))
                .to.be.revertedWith('Ownable: caller is not the owner');
        });
    });

    describe('Staking', () => {
        before(async () => {
            await fanToArtistStaking.addArtist(artist1.address, owner.address);
            await jtp.mint(addr1.address, 100)
        });

        it('Should be able to stake only to a verified artist', async () => {
            await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, 100, 10))
                .to.emit(fanToArtistStaking, 'ArtistStaked')
                .withArgs(artist1.address, addr1.address, 100, 10);

            expect(await jtp.balanceOf(fanToArtistStaking.address)).to.equal(100);
            expect(await jtp.balanceOf(addr1.address)).to.equal(0);
        });

        it('Should be able to redeem the token locked', async () => {
            await fanToArtistStaking.connect(addr1).redeem(artist1.address, 100);

            expect(await jtp.balanceOf(fanToArtistStaking.address)).to.equal(0);
            expect(await jtp.balanceOf(addr1.address)).to.equal(100);
        });

        describe('Reverts', () => {
            it('Should not be able to stake to a non verified artist', async () => {
                await expect(fanToArtistStaking.connect(addr2).stake(artist2.address, 100, 10))
                    .to.be.revertedWith('FanToArtistStaking: the artist is not a verified artist');
            });
        });
    });

    describe('Rates', () => {
        it('Should be able to change the veJTP reward rate', async () => {
            expect(await fanToArtistStaking.getStakingVeRate()).to.equal(10);
            await expect(fanToArtistStaking.changeStakingVeRate(90, owner.address))
                .to.emit(fanToArtistStaking, 'VeJTPRewardChanged')
                .withArgs(90, owner.address);
            expect(await fanToArtistStaking.getStakingVeRate()).to.equal(90);
        });

        it('Should be able to change the artist reward rate', async () => {
            expect(await fanToArtistStaking.getArtistRewardRate()).to.equal(10);
            await expect(fanToArtistStaking.changeArtistRewardRate(50, owner.address))
                .to.emit(fanToArtistStaking, 'ArtistJTPRewardChanged')
                .withArgs(50, owner.address);
            expect(await fanToArtistStaking.getArtistRewardRate()).to.equal(50);
        });
    });

});