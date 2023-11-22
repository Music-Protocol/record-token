import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { FanToArtistStaking, Web3MusicNativeToken } from '../typechain-types/index';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { timeMachine, getStakeExtendedFromEvent, getStakeArtistFromEvent } from './utils/utils';

describe("FanToArtistStaking2", function () {

    async function deploy() {
        const [owner, addr1, addr2, addr3, artist1, artist2, artist3] = await ethers.getSigners();
        const defVeReward = 10;
        const defArtistReward = 10;
        const amount = 10n * 10n ** 18n;
        const blockBefore = await ethers.provider.getBlock(await ethers.provider.getBlockNumber());
        const FTAS = await ethers.getContractFactory('FanToArtistStaking');
        const fanToArtistStaking = await FTAS.deploy() as FanToArtistStaking;
        await fanToArtistStaking.deployed();

        const cWeb3MusicNativeToken = await ethers.getContractFactory('Web3MusicNativeToken');
        const Web3MusicNativeToken = await cWeb3MusicNativeToken.deploy(fanToArtistStaking.address) as Web3MusicNativeToken;
        await Web3MusicNativeToken.deployed();
        await fanToArtistStaking.initialize(Web3MusicNativeToken.address, defVeReward, defArtistReward, 10, 86400, 3, 10);

        await Web3MusicNativeToken.connect(owner).mint(addr1.address, amount);

        await expect(fanToArtistStaking.addArtist(artist1.address, owner.address));
        await expect(fanToArtistStaking.addArtist(artist2.address, owner.address));

        return { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, addr2, addr3, artist1, artist2, artist3, amount, blockBefore }
    }

    it('User should be able to stake and reedem', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, amount } = await loadFixture(deploy);;

        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 60))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount, anyValue);

        expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(amount);
        expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(0);

        await timeMachine(1);

        await expect(fanToArtistStaking.connect(addr1).redeem(artist1.address, addr1.address))
            .to.emit(fanToArtistStaking, 'StakeRedeemed')
            .withArgs(artist1.address, addr1.address);

        expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(0);
        expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(amount);

    });

    it('User should be able to extend stake', async () => {
        const { fanToArtistStaking, addr1, artist1, amount, blockBefore } = await loadFixture(deploy);

        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 3600));
        const { end } = await getStakeExtendedFromEvent({}, await fanToArtistStaking.connect(addr1).extendStake(artist1.address, 3600));
        expect(end).to.be.closeTo(blockBefore.timestamp + 7200, 10);

    });

    it('User should be able to change artist', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, artist2, amount } = await loadFixture(deploy);

        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 60));

        await expect(fanToArtistStaking.connect(addr1).changeArtistStaked(artist1.address, artist2.address))
            .to.emit(fanToArtistStaking, 'StakeChangedArtist')
            .withArgs(artist1.address, addr1.address, artist2.address);

        await timeMachine(1);

        await expect(fanToArtistStaking.connect(addr1).redeem(artist1.address, addr1.address))
            .to.revertedWith('FanToArtistStaking: stake not found')

        await expect(fanToArtistStaking.connect(addr1).redeem(artist2.address, addr1.address))
            .to.emit(fanToArtistStaking, 'StakeRedeemed')
            .withArgs(artist2.address, addr1.address);

        expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(0);
        expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(amount);

    });

    it('User should be able to increase a stake', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, owner, amount } = await loadFixture(deploy);

        await Web3MusicNativeToken.connect(owner).mint(addr1.address, amount);

        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 60))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount, anyValue);

        await expect(fanToArtistStaking.connect(addr1).increaseAmountStaked(artist1.address, amount))
            .to.emit(fanToArtistStaking, "StakeIncreased")
            .withArgs(artist1.address, addr1.address, amount);

        expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(amount * 2n);
        expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(0);
    });

    it('User should be able to change artist to already staked artist', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, artist2, amount } = await loadFixture(deploy);;

        await fanToArtistStaking.connect(addr1).stake(artist1.address, amount / 2n, 60);
        await fanToArtistStaking.connect(addr1).stake(artist2.address, amount / 2n, 60);

        expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(amount);
        expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(0);

        await expect(fanToArtistStaking.connect(addr1).changeArtistStaked(artist1.address, artist2.address))
            .to.emit(fanToArtistStaking, 'StakeChangedArtist')
            .withArgs(artist1.address, addr1.address, artist2.address);

        await timeMachine(1);

        await expect(fanToArtistStaking.connect(addr1).redeem(artist1.address, addr1.address))
            .to.revertedWith('FanToArtistStaking: stake not found')

        await expect(fanToArtistStaking.connect(addr1).redeem(artist2.address, addr1.address))
            .to.emit(fanToArtistStaking, 'StakeRedeemed')
            .withArgs(artist2.address, addr1.address);

        expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(0);
        expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(amount);

    });

    describe("Early redeem", function () {
        it('Duration should be the longest, first stake longer', async () => {
            const { Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, artist2, amount} = await loadFixture(deploy);;

            await fanToArtistStaking.connect(addr1).stake(artist1.address, amount / 2n, 3600);

            await timeMachine(15);

            await fanToArtistStaking.connect(addr1).stake(artist2.address, amount / 2n, 1800);

            await timeMachine(15);

            expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(amount);
            expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(0);

            await expect(fanToArtistStaking.connect(addr1).changeArtistStaked(artist1.address, artist2.address))
                .to.emit(fanToArtistStaking, 'StakeChangedArtist')
                .withArgs(artist1.address, addr1.address, artist2.address);
            
            await timeMachine(59);

            await expect(fanToArtistStaking.connect(addr1).redeem(artist1.address, addr1.address))
                .to.revertedWith('FanToArtistStaking: stake not found');

            await expect(fanToArtistStaking.connect(addr1).redeem(artist2.address, addr1.address))
                .to.revertedWith('FanToArtistStaking: the stake is not ended');
            
            await timeMachine(1);

            await expect(fanToArtistStaking.connect(addr1).redeem(artist2.address, addr1.address))
                .to.emit(fanToArtistStaking, 'StakeRedeemed')
                .withArgs(artist2.address, addr1.address);

            expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(0);
            expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(amount);
        });

        it('Duration should be the longest, second stake longer', async () => {
            const { Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, artist2, amount} = await loadFixture(deploy);;

            await fanToArtistStaking.connect(addr1).stake(artist1.address, amount / 2n, 2700);

            await timeMachine(15);

            await fanToArtistStaking.connect(addr1).stake(artist2.address, amount / 2n, 3600);

            await timeMachine(15);

            expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(amount);
            expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(0);

            await expect(fanToArtistStaking.connect(addr1).changeArtistStaked(artist1.address, artist2.address))
                .to.emit(fanToArtistStaking, 'StakeChangedArtist')
                .withArgs(artist1.address, addr1.address, artist2.address);
            
            await timeMachine(59);

            await expect(fanToArtistStaking.connect(addr1).redeem(artist1.address, addr1.address))
                .to.revertedWith('FanToArtistStaking: stake not found');

            await expect(fanToArtistStaking.connect(addr1).redeem(artist2.address, addr1.address))
                .to.revertedWith('FanToArtistStaking: the stake is not ended');
            
            await timeMachine(1);

            await expect(fanToArtistStaking.connect(addr1).redeem(artist2.address, addr1.address))
                .to.emit(fanToArtistStaking, 'StakeRedeemed')
                .withArgs(artist2.address, addr1.address);

            expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(0);
            expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(amount);
        });
    });
    describe("Revert", function () {
        describe("extendStake", function () {
            it('User should not be able to extend non-existent stake', async () => {
                const { fanToArtistStaking, addr1, artist1, amount, blockBefore } = await loadFixture(deploy);

                await expect(fanToArtistStaking.connect(addr1).extendStake(artist1.address, 3600))
                    .to.revertedWith('FanToArtistStaking: no stake found');

            });
            it('User should not be able to extend stake already ended', async () => {
                const { fanToArtistStaking, addr1, artist1, amount, blockBefore } = await loadFixture(deploy);

                await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 3600));
                await timeMachine(60);
                await expect(fanToArtistStaking.connect(addr1).extendStake(artist1.address, 3600))
                    .to.revertedWith('FanToArtistStaking: last stake cant be changed');

            });
            it('User should not be able to extend the stake with too short period', async () => {
                const { fanToArtistStaking, addr1, artist1, amount } = await loadFixture(deploy);

                await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 3600));
                await expect(fanToArtistStaking.connect(addr1).extendStake(artist1.address, 9))
                    .to.revertedWith('FanToArtistStaking: the stake period exceed the maximum or less than minimum');

            });
            it('User should not be able to extend the stake with too long period', async () => {
                const { fanToArtistStaking, addr1, artist1, amount } = await loadFixture(deploy);

                await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 3600));
                await expect(fanToArtistStaking.connect(addr1).extendStake(artist1.address, 86401))
                    .to.revertedWith('FanToArtistStaking: the stake period exceed the maximum or less than minimum');

            });
            it('User should not be able to extend the stake beyond the maximum period', async () => {
                const { fanToArtistStaking, addr1, artist1, amount } = await loadFixture(deploy);

                await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 86390));
                await expect(fanToArtistStaking.connect(addr1).extendStake(artist1.address, 11))
                    .to.revertedWith('FanToArtistStaking: the new stake period exceeds the maximum');

            });
        });
        describe("changeArtistStaked", function () {
            it('User should not be able to change artist to unverified artist', async () => {
                const { fanToArtistStaking, addr1, artist1, artist3, amount } = await loadFixture(deploy);

                await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 60));

                await expect(fanToArtistStaking.connect(addr1).changeArtistStaked(artist1.address, artist3.address))
                    .to.revertedWith('FanToArtistStaking: the artist is not a verified artist');

            });

            it('User should not be able to change artist from non-existent stake', async () => {
                const { fanToArtistStaking, addr1, artist1, artist2 } = await loadFixture(deploy);

                await expect(fanToArtistStaking.connect(addr1).changeArtistStaked(artist1.address, artist2.address))
                    .to.revertedWith('FanToArtistStaking: no stake found');

            });
            it('User should not be able to change artist from ended stake', async () => {
                const { fanToArtistStaking, addr1, artist1, artist2, amount } = await loadFixture(deploy);

                await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 60));

                await timeMachine(60);

                await expect(fanToArtistStaking.connect(addr1).changeArtistStaked(artist1.address, artist2.address))
                    .to.revertedWith('FanToArtistStaking: last stake cant be changed');

            });
            it('User should not be able to change artist to same artist', async () => {
                const { fanToArtistStaking, addr1, artist1, amount } = await loadFixture(deploy);

                await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 60));

                await expect(fanToArtistStaking.connect(addr1).changeArtistStaked(artist1.address, artist1.address))
                    .to.revertedWith('FanToArtistStaking: the new artist is the same as the old one');

            });
            it('User should not be able to change artist to already staked artist with ended stake', async () => {
                const { fanToArtistStaking, addr1, artist1, artist2, amount } = await loadFixture(deploy);

                await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 60));
                await expect(fanToArtistStaking.connect(addr1).stake(artist2.address, amount, 59));

                await timeMachine(1);

                await expect(fanToArtistStaking.connect(addr1).changeArtistStaked(artist1.address, artist2.address))
                    .to.revertedWith('FanToArtistStaking: last stake cant be changed');

            });
        });
        describe("changeArtistRewardLimit", function () {
            it('User should not be able to change REWARD_LIMIT', async () => {
                const { fanToArtistStaking, addr1 } = await loadFixture(deploy);;

                await expect(fanToArtistStaking.connect(addr1).changeArtistRewardLimit(50))
                    .to.revertedWith("Ownable: caller is not the owner");
            });
        });
    });
});