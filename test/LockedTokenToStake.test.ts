import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { ArtistStaking, MusicProtocolRECORDToken } from '../typechain-types/index';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { getTimestamp, timeMachine } from './utils/utils';

describe("Redeem of releasable tokens after creating a stake", function () {

    async function deploy() {
        const [owner, addr1, addr2, artist1, artist2, artist3] = await ethers.getSigners();
        const defVeReward = 10;
        const defArtistReward = 10;
        const amount = 100n * 10n ** 18n
        const amount2 = 100n * 10n ** 18n + amount / 3n
        const FTAS = await ethers.getContractFactory('ArtistStaking');
        const ArtistStaking = await upgrades.deployProxy(FTAS.connect(owner), [], { initializer: false, kind: 'uups', timeout: 180000 }) as unknown as ArtistStaking;
        await ArtistStaking.deployed();

        const cMusicProtocolRECORDToken = await ethers.getContractFactory('MusicProtocolRECORDToken');
        const MusicProtocolRECORDToken = await cMusicProtocolRECORDToken.deploy(ArtistStaking.address) as MusicProtocolRECORDToken;
        await MusicProtocolRECORDToken.deployed();

        await ArtistStaking.initialize(MusicProtocolRECORDToken.address, defVeReward, defArtistReward, 86400, 3, 600);

        await expect(MusicProtocolRECORDToken.connect(owner).mint_and_lock(addr1.address, amount, await getTimestamp(), 3600))
            .to.emit(MusicProtocolRECORDToken, "Transfer");

        await expect(ArtistStaking.addArtist(artist1.address, owner.address))
            .to.emit(ArtistStaking, 'ArtistAdded')
            .withArgs(artist1.address, owner.address);
        await expect(ArtistStaking.addArtist(artist3.address, owner.address))
            .to.emit(ArtistStaking, 'ArtistAdded')
            .withArgs(artist3.address, owner.address);

        return { MusicProtocolRECORDToken, ArtistStaking, owner, addr1, addr2, artist1, artist2, artist3, amount, amount2 }
    }

    it('User should be able to stake locked tokens', async () => {
        const { MusicProtocolRECORDToken, ArtistStaking, owner, addr1, addr2, artist1, artist2, amount } = await loadFixture(deploy);;
        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount / 3n));
        await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount / 3n, 60))
            .to.emit(ArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount / 3n, anyValue);
    });

    it('User should be able to stake owned tokens instead of locked tokens and reedem them', async () => {
        const { MusicProtocolRECORDToken, ArtistStaking, owner, addr1, addr2, artist1, artist2, artist3, amount } = await loadFixture(deploy);;

        await MusicProtocolRECORDToken.connect(owner).mint(addr1.address, amount / 3n);
        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount / 3n));
        await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount / 3n, 60))
            .to.emit(ArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount / 3n, anyValue);

        await timeMachine(1);

        await expect(ArtistStaking.connect(addr1).redeem(artist1.address, addr1.address)).to.emit(ArtistStaking, "StakeRedeemed");


    });


    it('User should be able to increment stake with locked tokens', async () => {
        const { MusicProtocolRECORDToken, ArtistStaking, owner, addr1, addr2, artist1, artist2, amount } = await loadFixture(deploy);

        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount / 3n * 2n));
        await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount / 3n, 60))
            .to.emit(ArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount / 3n, anyValue);

        await expect(ArtistStaking.connect(addr1).increaseAmountStaked(artist1.address, amount / 3n))
            .to.emit(ArtistStaking, 'StakeIncreased')
            .withArgs(artist1.address, addr1.address, amount / 3n);
    });

    it('User should be able to stake locked and unlocked tokens', async () => {
        const { MusicProtocolRECORDToken, ArtistStaking, owner, addr1, addr2, artist1, artist2, amount } = await loadFixture(deploy);
        await MusicProtocolRECORDToken.connect(owner).mint(addr1.address, amount * 2n);
        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount * 3n));
        await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount * 3n, 60))
            .to.emit(ArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount * 3n, anyValue);

        await timeMachine(1);

        await expect(ArtistStaking.connect(addr1).redeem(artist1.address, addr1.address))
            .to.emit(ArtistStaking, 'StakeRedeemed')
            .withArgs(artist1.address, addr1.address);

        await expect(MusicProtocolRECORDToken.connect(addr1).transfer(owner.address, amount * 3n)).to.revertedWith("MusicProtocolRECORDToken: transfer amount exceeds balance");
        await expect(MusicProtocolRECORDToken.connect(addr1).transfer(owner.address, amount * 2n)).to.emit(MusicProtocolRECORDToken, "Transfer");
        await expect(MusicProtocolRECORDToken.connect(addr1).transfer(owner.address, amount * 2n)).to.revertedWith("ERC20: transfer amount exceeds balance");

        await timeMachine(59);
        await expect(MusicProtocolRECORDToken.connect(addr1).transfer(owner.address, amount)).to.emit(MusicProtocolRECORDToken, "Transfer");
    });

    it('User should be able to stake unlocked tokens', async () => {
        const { MusicProtocolRECORDToken, ArtistStaking, owner, addr2, artist1, artist2, amount } = await loadFixture(deploy);
        await MusicProtocolRECORDToken.connect(owner).mint(addr2.address, amount * 2n);

        await expect(MusicProtocolRECORDToken.connect(addr2).approve(ArtistStaking.address, amount * 2n));
        await expect(ArtistStaking.connect(addr2).stake(artist1.address, amount * 2n, 60))
            .to.emit(ArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr2.address, amount * 2n, anyValue);

        await expect(MusicProtocolRECORDToken.connect(addr2).transfer(owner.address, amount * 2n)).to.revertedWith('ERC20: transfer amount exceeds balance');

        await timeMachine(1);

        await expect(ArtistStaking.connect(addr2).redeem(artist1.address, addr2.address))
            .to.emit(ArtistStaking, 'StakeRedeemed')
            .withArgs(artist1.address, addr2.address);

        await expect(MusicProtocolRECORDToken.connect(addr2).transfer(owner.address, amount * 2n)).to.emit(MusicProtocolRECORDToken, "Transfer");
    });

    it('User should be able to stake locked tokens for a longer time than the release', async () => {
        const { MusicProtocolRECORDToken, ArtistStaking, owner, addr1, artist1, amount } = await loadFixture(deploy);

        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
        await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount, 7200))
            .to.emit(ArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount, anyValue);

        await expect(MusicProtocolRECORDToken.connect(addr1).transfer(owner.address, amount)).to.revertedWith('ERC20: transfer amount exceeds balance');

        await timeMachine(120);

        await expect(ArtistStaking.connect(addr1).redeem(artist1.address, addr1.address))
            .to.emit(ArtistStaking, 'StakeRedeemed')
            .withArgs(artist1.address, addr1.address);

        await expect(MusicProtocolRECORDToken.connect(addr1).transfer(owner.address, amount)).to.emit(MusicProtocolRECORDToken, "Transfer");
    });

    it('User should be able to stake locked and unlocked tokens for a longer time than the release', async () => {
        const { MusicProtocolRECORDToken, ArtistStaking, owner, addr1, addr2, artist1, artist2, amount } = await loadFixture(deploy);
        await MusicProtocolRECORDToken.connect(owner).mint(addr1.address, amount * 2n);

        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount * 3n));
        await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount * 3n, 7200))
            .to.emit(ArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount * 3n, anyValue);

        await timeMachine(120);

        await expect(ArtistStaking.connect(addr1).redeem(artist1.address, addr1.address))
            .to.emit(ArtistStaking, 'StakeRedeemed')
            .withArgs(artist1.address, addr1.address);

        await expect(MusicProtocolRECORDToken.connect(addr1).transfer(owner.address, amount * 3n)).to.emit(MusicProtocolRECORDToken, "Transfer");
    });

    it('If debt is less than the amount put in stake reedem the correct value', async () => {
        const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, artist3, amount } = await loadFixture(deploy);
        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
        await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount / 2n, 120))
            .to.emit(ArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount / 2n, anyValue);
        await expect(ArtistStaking.connect(addr1).stake(artist3.address, amount / 2n, 60))
            .to.emit(ArtistStaking, 'StakeCreated')
            .withArgs(artist3.address, addr1.address, amount / 2n, anyValue);

        await timeMachine(1);

        await ArtistStaking.connect(addr1).redeem(artist3.address, addr1.address);
        expect(await MusicProtocolRECORDToken.balanceOf(addr1.address)).to.be.equal(amount / 2n);
    });

    it('_beforeTokenTransfer should emit an event when it modify a releasablePayment during stake', async () => {
        const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, amount } = await loadFixture(deploy);
        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));

        const tx = await ArtistStaking.connect(addr1).stake(artist1.address, amount / 2n, 120)
        const rx = await tx.wait()
        const data = rx.logs[3].data;
        const topics = rx.logs[3].topics;
        const event = MusicProtocolRECORDToken.interface.decodeEventLog("SenderReleasablePaymentUpdate", data, topics);
        expect(event.senderToken).closeTo(amount / 2n, 1n * 10n ** 18n); //1 token tolerance
        expect(event.senderUpdatedDuration).closeTo(1800, 5); //5 seconds tolerance
    });

    it('_beforeTokenTransfer should emit an event when it modify a releasablePayment during redeem', async () => {
        const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, artist3, amount } = await loadFixture(deploy);
        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
        await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount / 2n, 120))
            .to.emit(ArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount / 2n, anyValue);
        await expect(ArtistStaking.connect(addr1).stake(artist3.address, amount / 2n, 120))
            .to.emit(ArtistStaking, 'StakeCreated')
            .withArgs(artist3.address, addr1.address, amount / 2n, anyValue);

        await timeMachine(2);

        const tx = await ArtistStaking.connect(addr1).redeem(artist1.address, addr1.address);
        const rx = await tx.wait()
        const data = rx.logs[0].data;
        const topics = rx.logs[0].topics;
        const event = MusicProtocolRECORDToken.interface.decodeEventLog("RecipientReleasablePaymentUpdate", data, topics);
        expect(event.recipientToken).closeTo(amount / 2n, 1n * 10n ** 18n); //1 token tolerance
        expect(event.recipientUpdatedDuration).closeTo(1800, 5); //5 seconds tolerance
    });

    describe('Reverts', async () => {

        it('User should not be able to stake more than him balance', async () => {
            const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, amount2 } = await loadFixture(deploy);
            await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount2));
            await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount2, 120))
                .to.revertedWith("ERC20: transfer amount exceeds balance");

        });

        it('User should not be able to spend locked token after redeem', async () => {
            const { MusicProtocolRECORDToken, ArtistStaking, owner, addr1, addr2, artist1, artist2, amount } = await loadFixture(deploy);

            await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
            await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount, 60))
                .to.emit(ArtistStaking, 'StakeCreated')
                .withArgs(artist1.address, addr1.address, amount, anyValue);

            await timeMachine(1);

            await expect(ArtistStaking.connect(addr1).redeem(artist1.address, addr1.address))
                .to.emit(ArtistStaking, 'StakeRedeemed')
                .withArgs(artist1.address, addr1.address);

            await expect(MusicProtocolRECORDToken.connect(addr1).transfer(owner.address, amount)).to.revertedWith("MusicProtocolRECORDToken: transfer amount exceeds balance");

            await timeMachine(29);

            await expect(MusicProtocolRECORDToken.connect(addr1).transfer(owner.address, amount / 2n)).to.emit(MusicProtocolRECORDToken, "Transfer");
            await expect(MusicProtocolRECORDToken.connect(addr1).transfer(owner.address, amount / 2n)).to.revertedWith("MusicProtocolRECORDToken: transfer amount exceeds balance");

            await timeMachine(30);
            await expect(MusicProtocolRECORDToken.connect(addr1).transfer(owner.address, amount / 2n)).to.emit(MusicProtocolRECORDToken, "Transfer");
        });

        it("Owner should not be able to (tranfer/mint)_and_lock with amount equal to 0", async () => {
            const { MusicProtocolRECORDToken, owner, addr1 } = await loadFixture(deploy);

            await expect(MusicProtocolRECORDToken.connect(owner).transfer_and_lock(owner.address, addr1.address, 0, await getTimestamp(), 3600))
                .to.revertedWith("MusicProtocolRECORDToken: Amount can not be 0 or less in transfer_and_lock.")
            await expect(MusicProtocolRECORDToken.connect(owner).mint_and_lock(addr1.address, 0, await getTimestamp(), 3600))
                .to.revertedWith("MusicProtocolRECORDToken: Amount can not be 0 or less in mint_and_lock.");
        })

        it("Only owner should be able to (tranfer/mint)_and_lock", async () => {
            const { MusicProtocolRECORDToken, owner, addr1 } = await loadFixture(deploy);

            await expect(MusicProtocolRECORDToken.connect(addr1).transfer_and_lock(owner.address, addr1.address, 0, await getTimestamp(), 3600))
                .to.revertedWith("Ownable: caller is not the owner")
            await expect(MusicProtocolRECORDToken.connect(addr1).mint_and_lock(addr1.address, 0, await getTimestamp(), 3600))
                .to.revertedWith("Ownable: caller is not the owner");
        })
    })
});