import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { FanToArtistStaking, Web3MusicNativeToken } from '../typechain-types';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { getTimestamp, timeMachine } from './utils/utils';
import { BigNumber } from 'ethers';

describe('FanToArtistStaking', () => {
    let Web3MusicNativeToken: Web3MusicNativeToken;
    let fanToArtistStaking: FanToArtistStaking;
    let owner: SignerWithAddress, addr1: SignerWithAddress, addr2: SignerWithAddress, addr3: SignerWithAddress, artist1: SignerWithAddress, artist2: SignerWithAddress, artist3: SignerWithAddress;

    const defVeReward = 10;
    const defArtistReward = 10;

    before(async () => {
        [owner, addr1, addr2, addr3, artist1, artist2, artist3] = await ethers.getSigners();

        const FTAS = await ethers.getContractFactory('FanToArtistStaking');
        fanToArtistStaking = await FTAS.deploy();
        await fanToArtistStaking.deployed();

        const cWeb3MusicNativeToken = await ethers.getContractFactory('Web3MusicNativeToken');
        Web3MusicNativeToken = await cWeb3MusicNativeToken.deploy(fanToArtistStaking.address);
        await Web3MusicNativeToken.deployed();
        await fanToArtistStaking.initialize(Web3MusicNativeToken.address, defVeReward, defArtistReward, 10, 86400, 3, 10);
    });

    describe('Deployment', () => {
        it('Should set the right owner', async () => {
            expect(await Web3MusicNativeToken.owner()).to.equal(owner.address);
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



    describe('Rates', () => {
        it('Should be able to change the veWeb3MusicNativeToken reward rate', async () => {
            expect(await fanToArtistStaking.getStakingVeRate()).to.equal(10);
        });

        it('Should be able to change the artist reward rate', async () => {
            expect(await fanToArtistStaking.getArtistRewardRate()).to.equal(10);
            await expect(fanToArtistStaking.changeArtistRewardRate(50, owner.address))
                .to.emit(fanToArtistStaking, 'ArtistWeb3MusicNativeTokenRewardChanged')
                .withArgs(50, anyValue, owner.address);
            expect(await fanToArtistStaking.getArtistRewardRate()).to.equal(50);
        });
    });

    describe('Staking', () => {
        type Stake = { redeemed?: boolean, artist?: string, amount?: BigNumber, rewardArtist?: number }
        let stake1: Stake = {}, stake2: Stake = {};
        let times: number[] = [];
        before(async () => {
            await fanToArtistStaking.addArtist(artist1.address, owner.address);
            await Web3MusicNativeToken.mint(addr1.address, BigNumber.from(10).pow(20));
            await fanToArtistStaking.addArtist(artist2.address, owner.address);
            await timeMachine(600);
            await fanToArtistStaking.changeArtistRewardRate(10, owner.address);
        });

        it('Should be able to stake only to a verified artist', async () => {
            const amount = BigNumber.from(10).pow(20);
            const time = 50;
            times.push(time);
            await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, time))
                .to.emit(fanToArtistStaking, 'StakeCreated')
                .withArgs(artist1.address, addr1.address, amount, anyValue);
            stake1 = {
                artist: artist1.address,
                amount,
                // start: anyValue,
                // end: anyValue,
                redeemed: false
            };
            expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(BigNumber.from(10).pow(20));
            expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(0);
        });

        it('Should be able to redeem the token locked', async () => {
            //pass time
            const blockNumBefore = await ethers.provider.getBlockNumber();
            const blockBefore = await ethers.provider.getBlock(blockNumBefore);
            await ethers.provider.send('evm_mine', [(60 * 10) + blockBefore.timestamp]);
            await fanToArtistStaking.connect(addr1).redeem(artist1.address, addr1.address);
            stake1.redeemed = true;

            expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(0);
            expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(BigNumber.from(10).pow(20));
        });

        it('Should be able to stake again', async () => {
            const amount = BigNumber.from(10).pow(20);
            const time = 86400;

            await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, time))
                .to.emit(fanToArtistStaking, 'StakeCreated')
                .withArgs(artist1.address, addr1.address, amount, anyValue);
            expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(amount);
            expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(0);
        });

        describe('Reverts', () => {
            it('Should not be able to stake less than minimum', async () => {
                await expect(fanToArtistStaking.connect(addr2).stake(artist2.address, BigNumber.from(10).pow(20), 5))
                    .to.be.revertedWith('FanToArtistStaking: the end period is less than minimum');
            });

            it('Should not be able to stake more than maximum', async () => {
                await expect(fanToArtistStaking.connect(addr2).stake(artist2.address, BigNumber.from(10).pow(20), 86401))
                    .to.be.revertedWith('FanToArtistStaking: the stake period exceed the maximum');
            });

            it('Should not be able to stake more than maximum', async () => {
                await Web3MusicNativeToken.mint(addr2.address, BigNumber.from(10).pow(20));
                await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, BigNumber.from(10).pow(20), 30))
                    .to.be.revertedWith('FanToArtistStaking: already staking');
            });

            it('Should not be able to stake a non verified artist', async () => {
                await expect(fanToArtistStaking.connect(addr2).stake(artist3.address, BigNumber.from(10).pow(20), 70))
                    .to.be.revertedWith('FanToArtistStaking: the artist is not a verified artist');
            });

            it('Should not be able to redeem a non existent stake', async () => {
                await expect(fanToArtistStaking.connect(addr1).redeem(artist3.address, addr1.address))
                    .to.be.revertedWith('FanToArtistStaking: stake not found');
            });

            it('Should not be able to transferOwnership if not the Owner', async () => {
                await expect(fanToArtistStaking.connect(addr2).transferOwnership(artist3.address))
                    .to.be.revertedWith('Ownable: caller is not the owner');
            });

            it('Should not be able to changeArtistReward if not the Owner', async () => {
                await expect(fanToArtistStaking.connect(addr2).changeArtistRewardRate(100000, artist3.address))
                    .to.be.revertedWith('Ownable: caller is not the owner');
            });

            it('Should not be able to extend a stake if the stake not found', async () => {
                await expect(fanToArtistStaking.connect(addr2).increaseAmountStaked(artist1.address, 50))
                    .to.be.revertedWith('FanToArtistStaking: no stake found');
            });

            it('Should not be able to extend a stake if there is no stake', async () => { //should not be necessary the test and the modifier
                const date = await getTimestamp() + 10;
                await expect(fanToArtistStaking.extendStake(artist1.address, 0))
                    .to.be.revertedWith('FanToArtistStaking: no stake found');
            });

            it('Should revert when extend a not existing stake', async () => {
                const date = Date.now();
                await expect(fanToArtistStaking.connect(owner).extendStake(artist2.address, 23))
                    .to.be.revertedWith('FanToArtistStaking: no stake found');
            });


            it('No event should be emitted if the artist was already added or removed', async () => {
                await expect(fanToArtistStaking.connect(owner).addArtist(artist1.address, artist1.address))
                    .not.to.emit(fanToArtistStaking, 'ArtistAdded');
                await fanToArtistStaking.connect(owner).removeArtist(artist1.address, artist1.address);
                await expect(fanToArtistStaking.connect(owner).removeArtist(artist1.address, artist1.address))
                    .not.to.emit(fanToArtistStaking, 'ArtistRemoved');
            });
        });
    });
});