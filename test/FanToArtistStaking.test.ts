import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { FanToArtistStaking, JTP } from '../typechain-types/index';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';

describe('FanToArtistStaking', () => {
    let jtp: JTP;
    let fanToArtistStaking: FanToArtistStaking;
    let owner: SignerWithAddress, addr1: SignerWithAddress, addr2: SignerWithAddress, addr3: SignerWithAddress, artist1: SignerWithAddress, artist2: SignerWithAddress, artist3: SignerWithAddress;

    const defVeReward = 10;
    const defArtistReward = 10;

    before(async () => {
        [owner, addr1, addr2, addr3, artist1, artist2, artist3] = await ethers.getSigners();

        const FTAS = await ethers.getContractFactory('FanToArtistStaking');
        fanToArtistStaking = await FTAS.deploy(defVeReward, defArtistReward, 10, 86400,);
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



    describe('Rates', () => {
        it('Should be able to change the veJTP reward rate', async () => {
            expect(await fanToArtistStaking.getStakingVeRate()).to.equal(10);
        });

        it('Should be able to change the artist reward rate', async () => {
            expect(await fanToArtistStaking.getArtistRewardRate()).to.equal(10);
            await expect(fanToArtistStaking.changeArtistRewardRate(50, owner.address))
                .to.emit(fanToArtistStaking, 'ArtistJTPRewardChanged')
                .withArgs(50, owner.address);
            expect(await fanToArtistStaking.getArtistRewardRate()).to.equal(50);
        });
    });

    describe('Staking', () => {
        type Stake = { redeemed?: boolean, artist?: string, amount?: number, rewardArtist?: number }
        let stake1: Stake = {}, stake2: Stake = {};
        let times: number[] = [];
        before(async () => {
            await fanToArtistStaking.addArtist(artist1.address, owner.address);
            await jtp.mint(addr1.address, 100);
            await fanToArtistStaking.addArtist(artist2.address, owner.address);
            await fanToArtistStaking.changeArtistRewardRate(10, owner.address);
        });

        it('Should be able to stake only to a verified artist', async () => {
            const amount = 100;
            const time = 50;
            times.push(time);
            await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, time))
                .to.emit(fanToArtistStaking, 'ArtistStaked')
                .withArgs(artist1.address, addr1.address, 100, anyValue);
            stake1 = {
                artist: artist1.address,
                amount,
                // start: anyValue,
                // end: anyValue,
                rewardArtist: defArtistReward,
                redeemed: false
            };
            expect(await jtp.balanceOf(fanToArtistStaking.address)).to.equal(100);
            expect(await jtp.balanceOf(addr1.address)).to.equal(0);
        });

        it('Should be able to redeem the token locked', async () => {
            //pass time
            const blockNumBefore = await ethers.provider.getBlockNumber();
            const blockBefore = await ethers.provider.getBlock(blockNumBefore);
            await ethers.provider.send('evm_mine', [(60 * 10) + blockBefore.timestamp]);
            const activeStake = await fanToArtistStaking.connect(addr1).getAllStake();
            const endTime = activeStake[0].stake.end.toNumber();
            await fanToArtistStaking.connect(addr1).redeem(artist1.address, endTime);
            stake1.redeemed = true;

            expect(await jtp.balanceOf(fanToArtistStaking.address)).to.equal(0);
            expect(await jtp.balanceOf(addr1.address)).to.equal(100);
        });

        it('Should be able to see his own stakes', async () => {
            const amount = 50;
            const time = 70;
            times.push(time);
            await fanToArtistStaking.connect(addr1).stake(artist2.address, amount, time);
            const as = await fanToArtistStaking.connect(addr1).getAllStake();
            const all = as.map(o => {
                return {
                    artist: o.artist,
                    amount: o.stake.amount.toNumber(),
                    // start: o.stake.start.toNumber(),
                    // end: o.stake.end.toNumber(),
                    rewardArtist: o.stake.rewardArtist.toNumber(),
                    redeemed: o.stake.redeemed
                }
            });
            stake2 = {
                artist: artist2.address,
                amount,
                // start: anyValue,
                // end: anyValue,
                rewardArtist: defArtistReward,
                redeemed: false
            };
            expect(all).to.have.deep.members([stake1, stake2]);
            const returnedTime = as.map(x => {
                return {
                    start: x.stake.start.toNumber(),
                    end: x.stake.end.toNumber(),
                }
            });
            const myTimes: Object[] = [];
            returnedTime.forEach(x => {
                times.forEach(element => {
                    myTimes.push({
                        start: x.start,
                        end: x.start + element
                    })
                })
            });
            expect(myTimes).to.include.deep.members(returnedTime);
        });

        it('Should be able to stake again', async () => {
            const amount = 50;
            const time = 86400;
            await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, time))
                .to.emit(fanToArtistStaking, 'ArtistStaked')
                .withArgs(artist1.address, addr1.address, amount, anyValue);
            expect(await jtp.balanceOf(fanToArtistStaking.address)).to.equal(100);
            expect(await jtp.balanceOf(addr1.address)).to.equal(0);
        });

        describe('Reverts', () => {
            it('Should not be able to stake less than minimum', async () => {
                await expect(fanToArtistStaking.connect(addr2).stake(artist2.address, 100, 5))
                    .to.be.revertedWith('FanToArtistStaking: the end period is less than minimum');
            });

            it('Should not be able to stake more than maximum', async () => {
                await expect(fanToArtistStaking.connect(addr2).stake(artist2.address, 100, 86401))
                    .to.be.revertedWith('FanToArtistStaking: the stake period exceed the maximum');
            });

            it('Should not be able to stake more than maximum', async () => {
                await jtp.mint(addr2.address, 100);
                await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, 1, 30))
                    .to.be.revertedWith('FanToArtistStaking: already staking');
            });

            it('Should not be able to stake a non verified artist', async () => {
                await expect(fanToArtistStaking.connect(addr2).stake(artist3.address, 100, 70))
                    .to.be.revertedWith('FanToArtistStaking: the artist is not a verified artist');
            });

            it('Should not be able to redeem a non existent stake', async () => {
                await expect(fanToArtistStaking.connect(addr1).redeem(artist3.address, 123))
                    .to.be.revertedWith('FanToArtistStaking: no stake found with this end date');
            });

            it('Should not be able to setJTP address if not the Owner', async () => {
                await expect(fanToArtistStaking.connect(addr2).setJTP(artist3.address))
                    .to.be.revertedWith('Ownable: caller is not the owner');
            });

            it('Should not be able to transferOwnership if not the Owner', async () => {
                await expect(fanToArtistStaking.connect(addr2).transferOwnership(artist3.address))
                    .to.be.revertedWith('Ownable: caller is not the owner');
            });

            it('Should not be able to changeArtistReward if not the Owner', async () => {
                await expect(fanToArtistStaking.connect(addr2).changeArtistRewardRate(100000, artist3.address))
                    .to.be.revertedWith('Ownable: caller is not the owner');
            });

            it('Should not be able to extend a stake if the artist is not in the verified artist list', async () => {
                await expect(fanToArtistStaking.connect(addr2).increaseAmountStaked(owner.address, 50, 30))
                    .to.be.revertedWith('FanToArtistStaking: the artist is not a verified artist');
            });

            it('Should not be able to extend a stake if the stake is ended', async () => {
                await expect(fanToArtistStaking.connect(addr2).increaseAmountStaked(artist1.address, 50, 30))
                    .to.be.revertedWith('FanToArtistStaking: the stake is already ended');
            });

            it('Should not be able to extend a stake if the stake not found', async () => {
                const date = Date.now();
                await expect(fanToArtistStaking.connect(addr2).increaseAmountStaked(artist1.address, 50, date))
                    .to.be.revertedWith('FanToArtistStaking: no stake found with this end date');
            });

            it('Should not be able to extend a stake if the stake not found', async () => {
                const date = Date.now();
                await expect(fanToArtistStaking.connect(addr2).increaseAmountStaked(artist1.address, 50, date))
                    .to.be.revertedWith('FanToArtistStaking: no stake found with this end date');
            });

            it('Should not be able to extend a stake if the artist is not verified', async () => { //should not be necessary the test and the modifier
                const date = Date.now();
                await expect(fanToArtistStaking.connect(addr2).extendStake(owner.address, 0, date))
                    .to.be.revertedWith('FanToArtistStaking: the artist is not a verified artist');
            });

            it('Should not be able to extend a stake is ended', async () => {
                const date = Date.now();
                await expect(fanToArtistStaking.connect(addr2).extendStake(artist1.address, 0, date + 50))
                    .to.be.revertedWith('FanToArtistStaking: the stake is already ended');
            });

            it('Should revert when extend a not existing stake', async () => {
                const date = Date.now();
                await expect(fanToArtistStaking.connect(addr2).extendStake(artist1.address, date + 50, date + 50))
                    .to.be.revertedWith('FanToArtistStaking: no stake found with this end date');
            });

            it('Should revert when extend a not existing stake', async () => {
                const date = Date.now();
                await expect(fanToArtistStaking.connect(owner).getReward())
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