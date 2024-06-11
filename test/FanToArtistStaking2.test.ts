import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { ArtistStaking, MusicProtocolRECORDToken } from '../typechain-types/index';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { getTimestamp, timeMachine } from './utils/utils';

describe("ArtistStaking2", function () {

    async function deployF2A() {
        const [owner, addr1, addr2, addr3, artist1, artist2, artist3] = await ethers.getSigners();
        const defArtistReward = 10;
        const amount = 10n * 10n ** 18n;
        const FTAS = await ethers.getContractFactory('ArtistStaking');
        const ArtistStaking = await upgrades.deployProxy(FTAS.connect(owner), [], { initializer: false, kind: 'uups', timeout: 180000 }) as ArtistStaking;
        await ArtistStaking.deployed();

        const cMusicProtocolRECORDToken = await ethers.getContractFactory('MusicProtocolRECORDToken');
        const MusicProtocolRECORDToken = await cMusicProtocolRECORDToken.deploy(ArtistStaking.address) as MusicProtocolRECORDToken;
        await MusicProtocolRECORDToken.deployed();
        await ArtistStaking.initialize(MusicProtocolRECORDToken.address, defArtistReward, 10, 86400, 3, 600);

        await MusicProtocolRECORDToken.connect(owner).mint(addr1.address, amount);

        await ArtistStaking.addArtist(artist1.address, owner.address);
        await ArtistStaking.addArtist(artist2.address, owner.address);
        await ArtistStaking.addArtist(artist3.address, owner.address);

        return { MusicProtocolRECORDToken, ArtistStaking, owner, addr1, addr2, addr3, artist1, artist2, artist3, amount }
    }

    it('Owner should be able to change artist reward limit', async () => {
        const { ArtistStaking, owner } = await loadFixture(deployF2A);
        expect(await ArtistStaking.connect(owner).changeArtistRewardLimit(4)).to.emit(ArtistStaking, "newRewardLimit").withArgs(3, 4);
    });

    it('User should be able to stake and reedem', async () => {
        const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, amount } = await loadFixture(deployF2A);
        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
        await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount, 60))
            .to.emit(ArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount, anyValue);

        expect(await MusicProtocolRECORDToken.balanceOf(ArtistStaking.address)).to.equal(amount);
        expect(await MusicProtocolRECORDToken.balanceOf(addr1.address)).to.equal(0);

        await timeMachine(1);

        await expect(ArtistStaking.connect(addr1).redeem(artist1.address,))
            .to.emit(ArtistStaking, 'StakeRedeemed')
            .withArgs(artist1.address, addr1.address);

        expect(await MusicProtocolRECORDToken.balanceOf(ArtistStaking.address)).to.equal(0);
        expect(await MusicProtocolRECORDToken.balanceOf(addr1.address)).to.equal(amount);

    });

    it('User should be able to change artist', async () => {
        const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, artist2, amount } = await loadFixture(deployF2A);

        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
        await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount, 60));

        await expect(ArtistStaking.connect(addr1).changeArtistStaked(artist1.address, artist2.address))
            .to.emit(ArtistStaking, 'StakeChangedArtist')
            .withArgs(artist1.address, addr1.address, artist2.address);

        await timeMachine(1);

        await expect(ArtistStaking.connect(addr1).redeem(artist1.address)).to.revertedWith('ArtistStaking: stake not found')

        await expect(ArtistStaking.connect(addr1).redeem(artist2.address))
            .to.emit(ArtistStaking, 'StakeRedeemed')
            .withArgs(artist2.address, addr1.address);

        expect(await MusicProtocolRECORDToken.balanceOf(ArtistStaking.address)).to.equal(0);
        expect(await MusicProtocolRECORDToken.balanceOf(addr1.address)).to.equal(amount);

    });

    it('User should be able to increase a stake', async () => {
        const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, owner, amount } = await loadFixture(deployF2A);

        await MusicProtocolRECORDToken.connect(owner).mint(addr1.address, amount);

        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
        await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount, 60))
            .to.emit(ArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount, anyValue);

        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
        await expect(ArtistStaking.connect(addr1).increaseAmountStaked(artist1.address, amount))
            .to.emit(ArtistStaking, "StakeIncreased")
            .withArgs(artist1.address, addr1.address, amount);

        expect(await MusicProtocolRECORDToken.balanceOf(ArtistStaking.address)).to.equal(amount * 2n);
        expect(await MusicProtocolRECORDToken.balanceOf(addr1.address)).to.equal(0);
    });

    it('User should be able to extend a stake', async () => {
        const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, owner, amount } = await loadFixture(deployF2A);

        await MusicProtocolRECORDToken.connect(owner).mint(addr1.address, amount);
        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
        const receipt1 = await ArtistStaking.connect(addr1).stake(artist1.address, amount, 60);
        const transactionReceipt1 = await receipt1.wait();

        const end1 = transactionReceipt1?.events && transactionReceipt1?.events[4].args && transactionReceipt1.events[4].args['end'];

        expect(end1).to.be.closeTo(await getTimestamp() + 60, 5); //Verified with a 5-second error

        const receipt2 = await ArtistStaking.connect(addr1).extendStake(artist1.address, 60);
        const transactionReceipt2 = await receipt2.wait();

        const end2 = transactionReceipt2?.events && transactionReceipt2?.events[0].args && transactionReceipt2.events[0].args['end'];

        expect(end2).to.be.closeTo(await getTimestamp() + 120, 5); //Verified with a 5-second error

        //Emit verification
        await expect(ArtistStaking.connect(addr1).extendStake(artist1.address, 60)).to.emit(ArtistStaking, "StakeEndChanged")
            .withArgs(artist1.address, addr1.address, anyValue);
    });

    it('User should not be able to change REWARD_LIMIT', async () => {
        const { ArtistStaking, addr1 } = await loadFixture(deployF2A);

        await expect(ArtistStaking.connect(addr1).changeArtistRewardLimit(50))
            .to.revertedWith("Ownable: caller is not the owner");
    });

    it('User should not be able to stake 0 tokens', async () => {
        const { ArtistStaking, addr1, artist1 } = await loadFixture(deployF2A);;

        await expect(ArtistStaking.connect(addr1).stake(artist1.address, 0, 3600))
            .to.revertedWith("ArtistStaking: the amount can not be zero");
    });

    it('User should not be able to increase stake 0 tokens', async () => {
        const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1 } = await loadFixture(deployF2A);

        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, 1));
        await expect(ArtistStaking.connect(addr1).stake(artist1.address, 1, 3600))

        await expect(ArtistStaking.connect(addr1).increaseAmountStaked(artist1.address, 0))
            .to.revertedWith("ArtistStaking: the amount can not be zero");
    });

    it('User should be able to redeem stake after the artist is not longer verified', async () => {
        const { MusicProtocolRECORDToken, ArtistStaking, owner, addr1, artist1 } = await loadFixture(deployF2A);

        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, 1));
        await ArtistStaking.connect(addr1).stake(artist1.address, 1, 3600);

        expect(await MusicProtocolRECORDToken.balanceOf(addr1.address)).to.equal(9999999999999999999n);

        await timeMachine(70);

        await expect(ArtistStaking.removeArtist(artist1.address, owner.address)).emit(ArtistStaking, "ArtistRemoved");

        await ArtistStaking.connect(addr1).redeem(artist1.address);

        expect(await MusicProtocolRECORDToken.balanceOf(addr1.address)).to.equal(10000000000000000000n);

    });

    it('Removed artist should receive the award of the tokens in stake up to that time', async () => {
        const { MusicProtocolRECORDToken, ArtistStaking, owner, addr1, artist1, amount } = await loadFixture(deployF2A);

        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
        await ArtistStaking.connect(addr1).stake(artist1.address, amount, 3600);

        await timeMachine(30);

        await expect(ArtistStaking.removeArtist(artist1.address, owner.address)).emit(ArtistStaking, "ArtistRemoved");

        expect(await MusicProtocolRECORDToken.balanceOf(artist1.address)).greaterThan(0n);
    });

    it('Removed user should not receive tokens in the period after removal', async () => {
        const { MusicProtocolRECORDToken, ArtistStaking, owner, addr1, artist1, amount } = await loadFixture(deployF2A);

        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
        await ArtistStaking.connect(addr1).stake(artist1.address, amount, 3600);

        await timeMachine(30);

        await expect(ArtistStaking.removeArtist(artist1.address, owner.address)).emit(ArtistStaking, "ArtistRemoved");

        const firstReward = await MusicProtocolRECORDToken.balanceOf(artist1.address);

        await timeMachine(30);

        await ArtistStaking.connect(addr1).getReward(artist1.address);

        expect(await MusicProtocolRECORDToken.balanceOf(artist1.address)).to.equal(firstReward);
    });

    it('User should be able to redeem token from removed artist', async () => {
        const { MusicProtocolRECORDToken, ArtistStaking, owner, addr1, artist1, amount } = await loadFixture(deployF2A)

        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
        await ArtistStaking.connect(addr1).stake(artist1.address, amount, 3600);

        await timeMachine(30);

        await expect(ArtistStaking.removeArtist(artist1.address, owner.address)).emit(ArtistStaking, "ArtistRemoved");

        await timeMachine(30);

        await expect(ArtistStaking.connect(addr1).redeem(artist1.address,)).emit(ArtistStaking, "StakeRedeemed");
    })

    describe('Reverts', () => {
        it('A user should not be able to change artist reward limit', async () => {
            const { ArtistStaking, addr1 } = await loadFixture(deployF2A);
            await expect(ArtistStaking.connect(addr1).changeArtistRewardLimit(4)).to.revertedWith("Ownable: caller is not the owner");
        });
        it('Should not be able to add in artistWhitelist the zero address', async () => {
            const { ArtistStaking, owner } = await loadFixture(deployF2A);
            await expect(ArtistStaking.connect(owner).addArtist(ethers.constants.AddressZero, owner.address)).to.revertedWith("ArtistStaking: the artist address can not be 0");
        });
        it('It should not be possible to change the artistRewardRate to zero', async () => {
            const { ArtistStaking, owner } = await loadFixture(deployF2A);
            await expect(ArtistStaking.connect(owner).changeArtistRewardRate(0, owner.address)).to.revertedWith("ArtistStaking: the artist reward rate can not be 0");
        });
        it('It should not be possible to change the artistRewardRate too many times in a short time', async () => {
            const { ArtistStaking, owner } = await loadFixture(deployF2A);
            await timeMachine(10);
            await ArtistStaking.connect(owner).changeArtistRewardRate(1, owner.address);
            await expect(ArtistStaking.connect(owner).changeArtistRewardRate(2, owner.address)).to.revertedWith("ArtistStaking: the artist reward cannot be changed yet");
        });
        it('The user should not be able to increase the stake period below the minimum limit or the maximum limit', async () => {
            const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, amount } = await loadFixture(deployF2A);

            await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
            await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount, 60))
                .to.emit(ArtistStaking, 'StakeCreated')
                .withArgs(artist1.address, addr1.address, amount, anyValue);

            await expect(ArtistStaking.connect(addr1).extendStake(artist1.address, 9))
                .to.revertedWith("ArtistStaking: the stake period exceed the maximum or less than minimum")
            await expect(ArtistStaking.connect(addr1).extendStake(artist1.address, 86401))
                .to.revertedWith("ArtistStaking: the stake period exceed the maximum or less than minimum")
        });
        it('User should not be able to increase the stake period over the old end more maximum limit', async () => {
            const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, amount } = await loadFixture(deployF2A);

            await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
            await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount, 120)) //In stake for 2 minutes
                .to.emit(ArtistStaking, 'StakeCreated')
                .withArgs(artist1.address, addr1.address, amount, anyValue);

            await timeMachine(1);

            await expect(ArtistStaking.connect(addr1).extendStake(artist1.address, 86400))
                .to.revertedWith("ArtistStaking: the new stake period exceeds the maximum")
        });
        it('User should not be able to increase the stake period of ended stake', async () => {
            const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, amount } = await loadFixture(deployF2A);

            await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
            await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount, 60))
                .to.emit(ArtistStaking, 'StakeCreated')
                .withArgs(artist1.address, addr1.address, amount, anyValue);

            await timeMachine(1);

            await expect(ArtistStaking.connect(addr1).extendStake(artist1.address, 20))
                .to.revertedWith("ArtistStaking: last stake cant be changed")
        });
        it('User should not be able to increase the stake below the minimum stake period ', async () => {
            const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, owner, amount } = await loadFixture(deployF2A);

            await MusicProtocolRECORDToken.connect(owner).mint(addr1.address, amount / 2n);
            await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
            await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount, 61))
                .to.emit(ArtistStaking, 'StakeCreated')
                .withArgs(artist1.address, addr1.address, amount, anyValue);

            await timeMachine(1);

            await expect(ArtistStaking.connect(addr1).increaseAmountStaked(artist1.address, amount / 2n))
                .to.revertedWith("ArtistStaking: can not increase the amount below the minimum stake period")
        });
        it('User should not be able to change the artist staked to a not verified artist', async () => {
            const { ArtistStaking, addr1, artist1 } = await loadFixture(deployF2A);

            await expect(ArtistStaking.connect(addr1).changeArtistStaked(artist1.address, addr1.address))
                .to.revertedWith("ArtistStaking: the artist is not a verified artist");

        });
        it('User should not be able to change the artist staked if the stake not exist ', async () => {
            const { ArtistStaking, addr1, artist1, artist2, owner, amount } = await loadFixture(deployF2A);

            await expect(ArtistStaking.connect(addr1).changeArtistStaked(artist1.address, artist2.address))
                .to.revertedWith("ArtistStaking: no stake found");

        });
        it('User should not be able to change the artist staked if the stake is ended ', async () => {
            const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, artist2, amount } = await loadFixture(deployF2A);

            await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
            await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount, 60))
                .to.emit(ArtistStaking, 'StakeCreated')
                .withArgs(artist1.address, addr1.address, amount, anyValue);

            await timeMachine(1);

            await expect(ArtistStaking.connect(addr1).changeArtistStaked(artist1.address, artist2.address))
                .to.revertedWith("ArtistStaking: last stake cant be changed");

        });
        it('User should not be able to stake on a new artist if they already have a stake on it', async () => {
            const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, artist2, owner, amount } = await loadFixture(deployF2A);

            await MusicProtocolRECORDToken.connect(owner).mint(addr1.address, amount / 2n);

            await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
            await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount / 2n, 60))
                .to.emit(ArtistStaking, 'StakeCreated')
                .withArgs(artist1.address, addr1.address, amount / 2n, anyValue);
            await expect(ArtistStaking.connect(addr1).stake(artist2.address, amount / 2n, 60))
                .to.emit(ArtistStaking, 'StakeCreated')
                .withArgs(artist2.address, addr1.address, amount / 2n, anyValue);

            await timeMachine(1);

            await expect(ArtistStaking.connect(addr1).changeArtistStaked(artist1.address, artist2.address))
                .to.revertedWith("ArtistStaking: already staking the new artist");

        });
        it('User should not be able to redeem if the stake is not ended ', async () => {
            const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, owner, amount } = await loadFixture(deployF2A);

            await MusicProtocolRECORDToken.connect(owner).mint(addr1.address, amount / 2n);

            await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
            await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount, 60))
                .to.emit(ArtistStaking, 'StakeCreated')
                .withArgs(artist1.address, addr1.address, amount, anyValue);

            await expect(ArtistStaking.connect(addr1).redeem(artist1.address,))
                .to.revertedWith("ArtistStaking: the stake is not ended")
        });

        it('User should not be able to increase a stake of a removed artist', async () => {
            const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, owner, amount } = await loadFixture(deployF2A);

            await MusicProtocolRECORDToken.connect(owner).mint(addr1.address, amount);

            await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
            await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount, 60))
                .to.emit(ArtistStaking, 'StakeCreated')
                .withArgs(artist1.address, addr1.address, amount, anyValue);

            await expect(ArtistStaking.connect(owner).removeArtist(artist1.address, owner.address))
                .to.emit(ArtistStaking, 'ArtistRemoved');

            await expect(ArtistStaking.connect(addr1).increaseAmountStaked(artist1.address, amount))
                .to.revertedWith("ArtistStaking: the artist is not a verified artist");
        });

        it('User should not be able to extend a stake of a removed artist', async () => {
            const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, artist2, owner, amount } = await loadFixture(deployF2A);

            await MusicProtocolRECORDToken.connect(owner).mint(addr1.address, amount);

            await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
            await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount, 60))
                .to.emit(ArtistStaking, 'StakeCreated')
                .withArgs(artist1.address, addr1.address, amount, anyValue);

            await expect(ArtistStaking.connect(owner).removeArtist(artist1.address, owner.address))
                .to.emit(ArtistStaking, 'ArtistRemoved');

            await expect(ArtistStaking.connect(addr1).extendStake(artist1.address, await getTimestamp() + 60))
                .to.revertedWith("ArtistStaking: the artist is not a verified artist");
        });

        it('User should not be able to change a stake to a removed artist', async () => {
            const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, artist2, owner, amount } = await loadFixture(deployF2A);

            await MusicProtocolRECORDToken.connect(owner).mint(addr1.address, amount);

            await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
            await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount, 60))
                .to.emit(ArtistStaking, 'StakeCreated')
                .withArgs(artist1.address, addr1.address, amount, anyValue);

            await expect(ArtistStaking.connect(owner).removeArtist(artist2.address, owner.address))
                .to.emit(ArtistStaking, 'ArtistRemoved');

            await expect(ArtistStaking.connect(addr1).changeArtistStaked(artist1.address, artist2.address))
                .to.revertedWith("ArtistStaking: the artist is not a verified artist");
        });
    });

    describe('Super Stake', async () => {
        it('A user should be able to stake on multiple artists simultaneously', async () => {
            const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, artist2, artist3, amount } = await loadFixture(deployF2A);
            await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
            await ArtistStaking.connect(addr1).addStakes([artist1.address, artist2.address, artist3.address], [amount / 3n, amount / 3n, amount / 3n], [60, 60, 60]);
            expect(await MusicProtocolRECORDToken.balanceOf(ArtistStaking.address)).to.equal(amount - 1n);
            expect(await MusicProtocolRECORDToken.balanceOf(addr1.address)).to.equal(1n);
            expect(await ArtistStaking.getVotes(addr1.address)).to.equal(amount - 1n);
        })
        describe('Reverts', () => {
            it('A user should not be able to stake on multiple artists if inputs have different lengths', async () => {
                const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, artist2, artist3, amount } = await loadFixture(deployF2A);

                await expect(ArtistStaking.connect(addr1).addStakes([artist1.address, artist2.address, artist3.address], [amount / 3n, amount / 3n], [60, 60, 60]))
                    .to.revertedWith("ArtistStaking: calldata format error");
                await expect(ArtistStaking.connect(addr1).addStakes([artist1.address, artist2.address, artist3.address], [amount / 3n, amount / 3n], [60, 60]))
                    .to.revertedWith("ArtistStaking: calldata format error");
                await expect(ArtistStaking.connect(addr1).addStakes([artist1.address, artist2.address], [amount / 3n, amount / 3n], [60, 60, 60]))
                    .to.revertedWith("ArtistStaking: calldata format error");

                expect(await MusicProtocolRECORDToken.balanceOf(ArtistStaking.address)).to.equal(0);
                expect(await MusicProtocolRECORDToken.balanceOf(addr1.address)).to.equal(amount);
                expect(await ArtistStaking.getVotes(addr1.address)).to.equal(0);
            });
            describe('If one input is wrong all the transtactions must be reverted', async () => {
                it('A artist is not verified', async () => {
                    const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, artist2, amount } = await loadFixture(deployF2A);
                    await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
                    await expect(ArtistStaking.connect(addr1).addStakes([artist1.address, artist2.address, addr1.address], [amount / 3n, amount / 3n, amount / 3n], [60, 60, 60]))
                        .to.revertedWith("ArtistStaking: the artist is not a verified artist");
                    expect(await MusicProtocolRECORDToken.balanceOf(ArtistStaking.address)).to.equal(0);
                    expect(await MusicProtocolRECORDToken.balanceOf(addr1.address)).to.equal(amount);
                    expect(await ArtistStaking.getVotes(addr1.address)).to.equal(0);
                })
                it('An amount exceeds balance', async () => {
                    const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, artist2, artist3, amount } = await loadFixture(deployF2A);
                    await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount + amount / 3n * 2n));
                    await expect(ArtistStaking.connect(addr1).addStakes([artist1.address, artist2.address, artist3.address], [amount / 3n, amount / 3n, amount], [60, 60, 60]))
                        .to.revertedWith("ERC20: transfer amount exceeds balance");
                    expect(await MusicProtocolRECORDToken.balanceOf(ArtistStaking.address)).to.equal(0);
                    expect(await MusicProtocolRECORDToken.balanceOf(addr1.address)).to.equal(amount);
                    expect(await ArtistStaking.getVotes(addr1.address)).to.equal(0);
                })
                it('An amount is zero', async () => {
                    const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, artist2, artist3, amount } = await loadFixture(deployF2A);
                    await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
                    await expect(ArtistStaking.connect(addr1).addStakes([artist1.address, artist2.address, artist3.address], [amount / 3n, amount / 3n, 0], [60, 60, 60]))
                        .to.revertedWith("ArtistStaking: the amount can not be zero");
                    expect(await MusicProtocolRECORDToken.balanceOf(ArtistStaking.address)).to.equal(0);
                    expect(await MusicProtocolRECORDToken.balanceOf(addr1.address)).to.equal(amount);
                    expect(await ArtistStaking.getVotes(addr1.address)).to.equal(0);
                })
                it('A end is less than minimum', async () => {
                    const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, artist2, artist3, amount } = await loadFixture(deployF2A);

                    await expect(ArtistStaking.connect(addr1).addStakes([artist1.address, artist2.address, artist3.address], [amount / 3n, amount / 3n, amount / 3n], [9, 60, 60]))
                        .to.revertedWith("ArtistStaking: the end period is less than minimum");
                    expect(await MusicProtocolRECORDToken.balanceOf(ArtistStaking.address)).to.equal(0);
                    expect(await MusicProtocolRECORDToken.balanceOf(addr1.address)).to.equal(amount);
                    expect(await ArtistStaking.getVotes(addr1.address)).to.equal(0);
                })
                it('A end is more than maximum', async () => {
                    const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, artist2, artist3, amount } = await loadFixture(deployF2A);

                    await expect(ArtistStaking.connect(addr1).addStakes([artist1.address, artist2.address, artist3.address], [amount / 3n, amount / 3n, amount / 3n], [86401, 60, 60]))
                        .to.revertedWith("ArtistStaking: the stake period exceed the maximum");
                    expect(await MusicProtocolRECORDToken.balanceOf(ArtistStaking.address)).to.equal(0);
                    expect(await MusicProtocolRECORDToken.balanceOf(addr1.address)).to.equal(amount);
                    expect(await ArtistStaking.getVotes(addr1.address)).to.equal(0);
                })
                it('An artist is already staked', async () => {
                    const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, artist2, amount } = await loadFixture(deployF2A);
                    await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
                    await ArtistStaking.connect(addr1).stake(artist1.address, amount / 3n, 60);

                    await expect(ArtistStaking.connect(addr1).addStakes([artist1.address, artist2.address], [amount / 3n, amount / 3n], [60, 60]))
                        .to.revertedWith("ArtistStaking: already staking");
                    expect(await MusicProtocolRECORDToken.balanceOf(ArtistStaking.address)).to.equal(amount / 3n);
                    expect(await MusicProtocolRECORDToken.balanceOf(addr1.address)).to.equal(amount - amount / 3n);
                    expect(await ArtistStaking.getVotes(addr1.address)).to.equal(amount / 3n);
                })
            });
        });
    });
});