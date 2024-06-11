import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ArtistStaking, MusicProtocolRECORDToken } from '../typechain-types';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { getTimestamp, timeMachine } from './utils/utils';
import { BigNumber } from 'ethers';

describe('ArtistStaking', () => {
    let MusicProtocolRECORDToken: MusicProtocolRECORDToken;
    let ArtistStaking: ArtistStaking;
    let owner: SignerWithAddress, addr1: SignerWithAddress, addr2: SignerWithAddress, addr3: SignerWithAddress, artist1: SignerWithAddress, artist2: SignerWithAddress, artist3: SignerWithAddress;
    const defArtistReward = 10;

    before(async () => {
        [owner, addr1, addr2, addr3, artist1, artist2, artist3] = await ethers.getSigners();

        const FTAS = await ethers.getContractFactory('ArtistStaking');
        ArtistStaking = await upgrades.deployProxy(FTAS.connect(owner), [], { initializer: false, kind: 'uups', timeout: 180000 }) as ArtistStaking;
        await ArtistStaking.deployed();

        const cMusicProtocolRECORDToken = await ethers.getContractFactory('MusicProtocolRECORDToken');
        MusicProtocolRECORDToken = await cMusicProtocolRECORDToken.deploy(ArtistStaking.address);
        await MusicProtocolRECORDToken.deployed();

        await ArtistStaking.initialize(MusicProtocolRECORDToken.address, defArtistReward, 10, 86400, 3, 600);
    });

    describe('Deployment', () => {
        it('Should set the right owner', async () => {
            expect(await MusicProtocolRECORDToken.owner()).to.equal(owner.address);
        });
    });

    describe('Verified Artist', () => {
        it('Should add the right artist to the verifiedArtists list and emit an event', async () => {
            await expect(ArtistStaking.addArtist(artist1.address, addr1.address))
                .to.emit(ArtistStaking, 'ArtistAdded')
                .withArgs(artist1.address, addr1.address);

            expect(await ArtistStaking.isVerified(artist1.address)).to.equal(true);
        });

        it('Should remove the right artist to the verifiedArtists list and emit an event', async () => {
            await expect(ArtistStaking.removeArtist(artist1.address, addr1.address))
                .to.emit(ArtistStaking, 'ArtistRemoved')
                .withArgs(artist1.address, addr1.address);

            expect(await ArtistStaking.isVerified(artist1.address)).to.equal(false);
        });

        it('Should return an error if the caller is not the owner', async () => {
            await expect(ArtistStaking.connect(addr2).addArtist(artist1.address, addr1.address))
                .to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('Should return an error if the caller is not the owner', async () => {
            await expect(ArtistStaking.connect(addr2).removeArtist(artist1.address, addr1.address))
                .to.be.revertedWith('Ownable: caller is not the owner');
        });
    });



    describe('Rates', () => {
        it('Should be able to change the artist reward rate', async () => {
            expect(await ArtistStaking.getArtistRewardRate()).to.equal(10);
            await timeMachine(10);
            await expect(ArtistStaking.changeArtistRewardRate(50, owner.address))
                .to.emit(ArtistStaking, 'ArtistMusicProtocolRECORDTokenRewardChanged')
                .withArgs(50, anyValue, owner.address);
            expect(await ArtistStaking.getArtistRewardRate()).to.equal(50);
        });
    });

    describe('Staking', () => {
        type Stake = { redeemed?: boolean, artist?: string, amount?: BigNumber, rewardArtist?: number }
        let stake1: Stake = {}, stake2: Stake = {};
        let times: number[] = [];
        before(async () => {
            await ArtistStaking.addArtist(artist1.address, owner.address);
            await MusicProtocolRECORDToken.mint(addr1.address, BigNumber.from(10).pow(20));
            await ArtistStaking.addArtist(artist2.address, owner.address);
            await timeMachine(600);
            await ArtistStaking.changeArtistRewardRate(10, owner.address);
        });

        it('Should be able to stake only to a verified artist', async () => {
            const amount = BigNumber.from(10).pow(20);
            const time = 50;
            times.push(time);
            await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
            await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount, time))
                .to.emit(ArtistStaking, 'StakeCreated')
                .withArgs(artist1.address, addr1.address, amount, anyValue);
            stake1 = {
                artist: artist1.address,
                amount,
                // start: anyValue,
                // end: anyValue,
                redeemed: false
            };
            expect(await MusicProtocolRECORDToken.balanceOf(ArtistStaking.address)).to.equal(BigNumber.from(10).pow(20));
            expect(await MusicProtocolRECORDToken.balanceOf(addr1.address)).to.equal(0);
        });

        it('Should be able to redeem the token locked', async () => {
            //pass time
            await ethers.provider.send('evm_mine', [(60 * 10) + await getTimestamp()]);
            await ArtistStaking.connect(addr1).redeem(artist1.address, addr1.address);
            stake1.redeemed = true;

            expect(await MusicProtocolRECORDToken.balanceOf(ArtistStaking.address)).to.equal(0);
            expect(await MusicProtocolRECORDToken.balanceOf(addr1.address)).to.equal(BigNumber.from(10).pow(20));
        });

        it('Should be able to stake again', async () => {
            const amount = BigNumber.from(10).pow(20);
            const time = 86400;
            await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
            await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount, time))
                .to.emit(ArtistStaking, 'StakeCreated')
                .withArgs(artist1.address, addr1.address, amount, anyValue);
            expect(await MusicProtocolRECORDToken.balanceOf(ArtistStaking.address)).to.equal(amount);
            expect(await MusicProtocolRECORDToken.balanceOf(addr1.address)).to.equal(0);
        });

        describe('Reverts', () => {
            it('Should not be able to stake less than minimum', async () => {
                await expect(ArtistStaking.connect(addr2).stake(artist2.address, BigNumber.from(10).pow(20), 5))
                    .to.be.revertedWith('ArtistStaking: the end period is less than minimum');
            });

            it('Should not be able to stake more than maximum', async () => {
                await expect(ArtistStaking.connect(addr2).stake(artist2.address, BigNumber.from(10).pow(20), 86401))
                    .to.be.revertedWith('ArtistStaking: the stake period exceed the maximum');
            });

            it('Should not be able to stake more than maximum', async () => {
                await MusicProtocolRECORDToken.mint(addr2.address, BigNumber.from(10).pow(20));
                await expect(ArtistStaking.connect(addr1).stake(artist1.address, BigNumber.from(10).pow(20), 30))
                    .to.be.revertedWith('ArtistStaking: already staking');
            });

            it('Should not be able to stake a non verified artist', async () => {
                await expect(ArtistStaking.connect(addr2).stake(artist3.address, BigNumber.from(10).pow(20), 70))
                    .to.be.revertedWith('ArtistStaking: the artist is not a verified artist');
            });

            it('Should not be able to redeem a non existent stake', async () => {
                await expect(ArtistStaking.connect(addr1).redeem(artist3.address, addr1.address))
                    .to.be.revertedWith('ArtistStaking: stake not found');
            });

            it('Should not be able to transferOwnership if not the Owner', async () => {
                await expect(ArtistStaking.connect(addr2).transferOwnership(artist3.address))
                    .to.be.revertedWith('Ownable: caller is not the owner');
            });

            it('Should not be able to changeArtistReward if not the Owner', async () => {
                await expect(ArtistStaking.connect(addr2).changeArtistRewardRate(100000, artist3.address))
                    .to.be.revertedWith('Ownable: caller is not the owner');
            });

            it('Should not be able to extend a stake if the stake not found', async () => {
                await expect(ArtistStaking.connect(addr2).increaseAmountStaked(artist1.address, 50))
                    .to.be.revertedWith('ArtistStaking: no stake found');
            });

            it('No event should be emitted if the artist was already added or removed', async () => {
                await expect(ArtistStaking.connect(owner).addArtist(artist1.address, artist1.address))
                    .not.to.emit(ArtistStaking, 'ArtistAdded');
                await ArtistStaking.connect(owner).removeArtist(artist1.address, artist1.address);
                await expect(ArtistStaking.connect(owner).removeArtist(artist1.address, artist1.address))
                    .not.to.emit(ArtistStaking, 'ArtistRemoved');
            });
        });
    });
});