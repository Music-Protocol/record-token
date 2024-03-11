import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { FanToArtistStaking, Web3MusicNativeToken } from '../typechain-types/index';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { getTimestamp, timeMachine } from './utils/utils';

describe("Redeem of releasable tokens after creating a stake", function () {
    
    async function deploy() {
        const [owner, addr1, addr2, artist1, artist2, artist3] = await ethers.getSigners();
        const defVeReward = 10;
        const defArtistReward = 10;
        const amount =  100n*10n**18n
        const amount2 =  100n*10n**18n + amount/3n
        const FTAS = await ethers.getContractFactory('FanToArtistStaking');
        const fanToArtistStaking = await upgrades.deployProxy(FTAS.connect(owner), [], {initializer: false, kind: 'uups', timeout: 180000}) as unknown as FanToArtistStaking;
        await fanToArtistStaking.deployed();

        const cWeb3MusicNativeToken = await ethers.getContractFactory('Web3MusicNativeToken');
        const Web3MusicNativeToken = await cWeb3MusicNativeToken.deploy(fanToArtistStaking.address) as Web3MusicNativeToken;
        await Web3MusicNativeToken.deployed();
        
        await fanToArtistStaking.initialize(Web3MusicNativeToken.address, defVeReward, defArtistReward, 86400, 3, 600);

        await expect(Web3MusicNativeToken.connect(owner).mint_and_lock(addr1.address, amount, await getTimestamp(), 3600))
            .to.emit(Web3MusicNativeToken, "Transfer");

        await expect(fanToArtistStaking.addArtist(artist1.address, owner.address))
            .to.emit(fanToArtistStaking, 'ArtistAdded')
            .withArgs(artist1.address, owner.address);
        await expect(fanToArtistStaking.addArtist(artist3.address, owner.address))
            .to.emit(fanToArtistStaking, 'ArtistAdded')
            .withArgs(artist3.address, owner.address);

        return { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, addr2, artist1, artist2, artist3, amount, amount2 }
    }

    it('User should be able to stake locked tokens', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, addr2, artist1, artist2, amount} = await loadFixture(deploy);;
        await expect(Web3MusicNativeToken.connect(addr1).approve(fanToArtistStaking.address, amount/3n));
        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount/3n, 60))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount/3n, anyValue);
    });

    it('User should be able to stake owned tokens instead of locked tokens and reedem them', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, addr2, artist1, artist2, artist3, amount} = await loadFixture(deploy);;

        await Web3MusicNativeToken.connect(owner).mint(addr1.address, amount/3n);
        await expect(Web3MusicNativeToken.connect(addr1).approve(fanToArtistStaking.address, amount/3n));
        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount/3n, 60))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount/3n, anyValue);

        await timeMachine(1);

        await expect(fanToArtistStaking.connect(addr1).redeem(artist1.address, addr1.address)).to.emit(fanToArtistStaking, "StakeRedeemed");

        
    });


    it('User should be able to increment stake with locked tokens', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, addr2, artist1, artist2, amount} = await loadFixture(deploy);
        
        await expect(Web3MusicNativeToken.connect(addr1).approve(fanToArtistStaking.address, amount/3n*2n));
        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount/3n, 60))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount/3n, anyValue);
        
        await expect(fanToArtistStaking.connect(addr1).increaseAmountStaked(artist1.address, amount/3n))
            .to.emit(fanToArtistStaking, 'StakeIncreased')
            .withArgs(artist1.address, addr1.address, amount/3n);
    });

    it('User should be able to stake locked and unlocked tokens', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, addr2, artist1, artist2, amount} = await loadFixture(deploy);
        await Web3MusicNativeToken.connect(owner).mint(addr1.address, amount*2n);
        await expect(Web3MusicNativeToken.connect(addr1).approve(fanToArtistStaking.address, amount*3n));
        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount*3n, 60))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount*3n, anyValue);

        await timeMachine(1);

        await expect(fanToArtistStaking.connect(addr1).redeem(artist1.address, addr1.address))
            .to.emit(fanToArtistStaking, 'StakeRedeemed')
            .withArgs(artist1.address, addr1.address);

        await expect(Web3MusicNativeToken.connect(addr1).transfer(owner.address, amount*3n)).to.revertedWith("Web3MusicNativeToken: transfer amount exceeds balance");
        await expect(Web3MusicNativeToken.connect(addr1).transfer(owner.address, amount*2n)).to.emit(Web3MusicNativeToken, "Transfer");
        await expect(Web3MusicNativeToken.connect(addr1).transfer(owner.address, amount*2n)).to.revertedWith("ERC20: transfer amount exceeds balance");

        await timeMachine(59);
        await expect(Web3MusicNativeToken.connect(addr1).transfer(owner.address, amount)).to.emit(Web3MusicNativeToken, "Transfer");
    });

    it('User should be able to stake unlocked tokens', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, owner, addr2, artist1, artist2, amount} = await loadFixture(deploy);
        await Web3MusicNativeToken.connect(owner).mint(addr2.address, amount*2n);

        await expect(Web3MusicNativeToken.connect(addr2).approve(fanToArtistStaking.address, amount*2n));
        await expect(fanToArtistStaking.connect(addr2).stake(artist1.address, amount*2n, 60))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr2.address, amount*2n, anyValue);

        await expect(Web3MusicNativeToken.connect(addr2).transfer(owner.address, amount*2n)).to.revertedWith('ERC20: transfer amount exceeds balance');

        await timeMachine(1);

        await expect(fanToArtistStaking.connect(addr2).redeem(artist1.address, addr2.address))
            .to.emit(fanToArtistStaking, 'StakeRedeemed')
            .withArgs(artist1.address, addr2.address);

        await expect(Web3MusicNativeToken.connect(addr2).transfer(owner.address, amount*2n)).to.emit(Web3MusicNativeToken, "Transfer");
    });

    it('User should be able to stake locked tokens for a longer time than the release', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, artist1, amount} = await loadFixture(deploy);

        await expect(Web3MusicNativeToken.connect(addr1).approve(fanToArtistStaking.address, amount));
        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 7200))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount, anyValue);

        await expect(Web3MusicNativeToken.connect(addr1).transfer(owner.address, amount)).to.revertedWith('ERC20: transfer amount exceeds balance');

        await timeMachine(120);

        await expect(fanToArtistStaking.connect(addr1).redeem(artist1.address, addr1.address))
            .to.emit(fanToArtistStaking, 'StakeRedeemed')
            .withArgs(artist1.address, addr1.address);

        await expect(Web3MusicNativeToken.connect(addr1).transfer(owner.address, amount)).to.emit(Web3MusicNativeToken, "Transfer");
    });

    it('User should be able to stake locked and unlocked tokens for a longer time than the release', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, addr2, artist1, artist2, amount} = await loadFixture(deploy);
        await Web3MusicNativeToken.connect(owner).mint(addr1.address, amount*2n);

        await expect(Web3MusicNativeToken.connect(addr1).approve(fanToArtistStaking.address, amount*3n));
        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount*3n, 7200))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount*3n, anyValue);

        await timeMachine(120);

        await expect(fanToArtistStaking.connect(addr1).redeem(artist1.address, addr1.address))
            .to.emit(fanToArtistStaking, 'StakeRedeemed')
            .withArgs(artist1.address, addr1.address);

        await expect(Web3MusicNativeToken.connect(addr1).transfer(owner.address, amount*3n)).to.emit(Web3MusicNativeToken, "Transfer");
    });

    it('If debt is less than the amount put in stake reedem the correct value', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, artist3, amount} = await loadFixture(deploy);
        await expect(Web3MusicNativeToken.connect(addr1).approve(fanToArtistStaking.address, amount));
        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount/2n, 120))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount/2n, anyValue);
        await expect(fanToArtistStaking.connect(addr1).stake(artist3.address, amount/2n, 60))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist3.address, addr1.address, amount/2n, anyValue);

        await timeMachine(1);

        await fanToArtistStaking.connect(addr1).redeem(artist3.address, addr1.address);
        expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.be.equal(amount/2n);
    });

    it('_beforeTokenTransfer should emit an event when it modify a releasablePayment during stake', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, amount} = await loadFixture(deploy);
        await expect(Web3MusicNativeToken.connect(addr1).approve(fanToArtistStaking.address, amount));
        
        const tx = await fanToArtistStaking.connect(addr1).stake(artist1.address, amount/2n, 120)
        const rx = await tx.wait()
        const data = rx.logs[3].data;
        const topics = rx.logs[3].topics;
        const event = Web3MusicNativeToken.interface.decodeEventLog("SenderReleasablePaymentUpdate", data, topics);
        expect(event.senderToken).closeTo(amount/2n, 1n*10n**18n); //1 token tolerance
        expect(event.senderUpdatedDuration).closeTo(1800, 5); //5 seconds tolerance
    });

    it('_beforeTokenTransfer should emit an event when it modify a releasablePayment during redeem', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, artist3, amount} = await loadFixture(deploy);
        await expect(Web3MusicNativeToken.connect(addr1).approve(fanToArtistStaking.address, amount));
        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount/2n, 120))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount/2n, anyValue);
        await expect(fanToArtistStaking.connect(addr1).stake(artist3.address, amount/2n, 120))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist3.address, addr1.address, amount/2n, anyValue);

        await timeMachine(2);

        const tx = await fanToArtistStaking.connect(addr1).redeem(artist1.address, addr1.address);
        const rx = await tx.wait()
        const data = rx.logs[0].data;
        const topics = rx.logs[0].topics;
        const event = Web3MusicNativeToken.interface.decodeEventLog("RecipientReleasablePaymentUpdate", data, topics);
        expect(event.recipientToken).closeTo(amount/2n, 1n*10n**18n); //1 token tolerance
        expect(event.recipientUpdatedDuration).closeTo(1800, 5); //5 seconds tolerance
    });

    describe('Reverts', async () => {

        it('User should not be able to stake more than him balance', async () =>  {
            const { Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, amount2} = await loadFixture(deploy);
            await expect(Web3MusicNativeToken.connect(addr1).approve(fanToArtistStaking.address, amount2));
            await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount2, 120))
                .to.revertedWith("ERC20: transfer amount exceeds balance");
    
        });

        it('User should not be able to spend locked token after redeem', async () => {
            const { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, addr2, artist1, artist2, amount} = await loadFixture(deploy);
    
            await expect(Web3MusicNativeToken.connect(addr1).approve(fanToArtistStaking.address, amount));
            await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 60))
                .to.emit(fanToArtistStaking, 'StakeCreated')
                .withArgs(artist1.address, addr1.address, amount, anyValue);
    
            await timeMachine(1);
    
            await expect(fanToArtistStaking.connect(addr1).redeem(artist1.address, addr1.address))
                .to.emit(fanToArtistStaking, 'StakeRedeemed')
                .withArgs(artist1.address, addr1.address);
    
            await expect(Web3MusicNativeToken.connect(addr1).transfer(owner.address, amount)).to.revertedWith("Web3MusicNativeToken: transfer amount exceeds balance");
    
            await timeMachine(29);
    
            await expect(Web3MusicNativeToken.connect(addr1).transfer(owner.address, amount/2n)).to.emit(Web3MusicNativeToken, "Transfer");
            await expect(Web3MusicNativeToken.connect(addr1).transfer(owner.address, amount/2n)).to.revertedWith("Web3MusicNativeToken: transfer amount exceeds balance");
    
            await timeMachine(30);
            await expect(Web3MusicNativeToken.connect(addr1).transfer(owner.address, amount/2n)).to.emit(Web3MusicNativeToken, "Transfer");
        });

        it("Owner should not be able to (tranfer/mint)_and_lock with amount equal to 0", async () => {
            const { Web3MusicNativeToken, owner, addr1 } = await loadFixture(deploy);

            await expect(Web3MusicNativeToken.connect(owner).transfer_and_lock(addr1.address, 0, await getTimestamp(), 3600))
                .to.revertedWith("Web3MusicNativeToken: Amount can not be 0 or less in transfer_and_lock.")
            await expect(Web3MusicNativeToken.connect(owner).mint_and_lock(addr1.address, 0, await getTimestamp(), 3600))
                .to.revertedWith("Web3MusicNativeToken: Amount can not be 0 or less in mint_and_lock.");
        })
        
        it("Only owner should be able to (tranfer/mint)_and_lock", async () => {
            const { Web3MusicNativeToken, owner, addr1 } = await loadFixture(deploy);

            await expect(Web3MusicNativeToken.connect(addr1).transfer_and_lock(addr1.address, 0, await getTimestamp(), 3600))
                .to.revertedWith("Ownable: caller is not the owner")
            await expect(Web3MusicNativeToken.connect(addr1).mint_and_lock(addr1.address, 0, await getTimestamp(), 3600))
                .to.revertedWith("Ownable: caller is not the owner");
        })
    })
});