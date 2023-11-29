import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { FanToArtistStaking, Web3MusicNativeToken } from '../typechain-types/index';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { timeMachine } from './utils/utils';

describe("FanToArtistStaking2", function () {
    
    async function deploy() {
        const [owner, addr1, addr2, addr3, artist1, artist2, artist3] = await ethers.getSigners();
        const defVeReward = 10;
        const defArtistReward = 10;
        const amount = 10n*10n**18n;
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
        await expect(fanToArtistStaking.addArtist(artist3.address, owner.address));

        return { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, addr2, addr3, artist1, artist2, artist3, amount}
    }

    it('User should be able to stake and reedem', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, amount } = await loadFixture(deploy);
        
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

    it('User should be able to change artist', async () => {
        const {Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, artist2, amount } = await loadFixture(deploy);
        
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
        const {Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, owner, amount } = await loadFixture(deploy);

        await Web3MusicNativeToken.connect(owner).mint(addr1.address, amount);

        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 60))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount, anyValue);

        await expect(fanToArtistStaking.connect(addr1).increaseAmountStaked(artist1.address, amount))
            .to.emit(fanToArtistStaking, "StakeIncreased")
            .withArgs(artist1.address, addr1.address, amount);

        expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(amount*2n);
        expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(0);
    });

    it('User should not be able to change REWARD_LIMIT', async () => {
        const { fanToArtistStaking, addr1 } = await loadFixture(deploy);
        
        await expect(fanToArtistStaking.connect(addr1).changeArtistRewardLimit(50))
            .to.revertedWith("Ownable: caller is not the owner");
    });

    it('User should not be able to stake 0 tokens', async () => {
        const { fanToArtistStaking, addr1, artist1} = await loadFixture(deploy);;
        
        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, 0, 3600))
            .to.revertedWith("FanToArtistStaking: the amount can not be zero");
    });

    it('User should not be able to increase stake 0 tokens', async () => {
        const { fanToArtistStaking, addr1, artist1} = await loadFixture(deploy);

        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, 1, 3600))
        
        await expect(fanToArtistStaking.connect(addr1).increaseAmountStaked(artist1.address, 0))
            .to.revertedWith("FanToArtistStaking: the amount can not be zero");
    });
    
});