import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { FanToArtistStaking, Web3MusicNativeToken } from '../typechain-types/index';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { timeMachine } from './utils/utils';
import { BigNumber } from 'ethers';

describe("Redeem of releasable tokens after creating a stake", function () {
    
    async function deploy() {
        const [owner, addr1, addr2, artist1, artist2] = await ethers.getSigners();
        const defVeReward = 10;
        const defArtistReward = 10;
        const amount =  100n*10n**18n
        const blockBefore = await ethers.provider.getBlock(await ethers.provider.getBlockNumber());
        const FTAS = await ethers.getContractFactory('FanToArtistStaking');
        const fanToArtistStaking = await FTAS.deploy();
        await fanToArtistStaking.deployed();

        const cWeb3MusicNativeToken = await ethers.getContractFactory('Web3MusicNativeToken');
        const Web3MusicNativeToken = await cWeb3MusicNativeToken.deploy(fanToArtistStaking.address) as Web3MusicNativeToken;
        await Web3MusicNativeToken.deployed();
        await fanToArtistStaking.initialize(Web3MusicNativeToken.address, defVeReward, defArtistReward, 10, 86400);

        await expect(Web3MusicNativeToken.connect(owner).mint_and_lock(addr1.address, amount, blockBefore.timestamp, 3600))
            .to.emit(Web3MusicNativeToken, "Transfer");

        await expect(fanToArtistStaking.addArtist(artist1.address, owner.address))
            .to.emit(fanToArtistStaking, 'ArtistAdded')
            .withArgs(artist1.address, owner.address);

        return { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, addr2, artist1, artist2, amount}
    }

    it('User should be able to stake locked tokens', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, addr2, artist1, artist2, amount} = await loadFixture(deploy);;

        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount/3n, 60))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount/3n, 0, anyValue);
        
        expect(await Web3MusicNativeToken.updatedDuration(addr1.address)).to.be.closeTo(2400, 3);
    });

    it('User should be able to increment stake with locked tokens', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, addr2, artist1, artist2, amount} = await loadFixture(deploy);

        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount/3n, 60))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount/3n, 0, anyValue);
        
        await expect(fanToArtistStaking.connect(addr1).increaseAmountStaked(artist1.address, amount/3n))
            .to.emit(fanToArtistStaking, 'StakeIncreased')
            .withArgs(artist1.address, addr1.address, amount/3n, 1);

        expect(await Web3MusicNativeToken.updatedDuration(addr1.address)).to.be.closeTo(1200, 3);
    });

    it('User should not be able to spend locked token after redeem', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, addr2, artist1, artist2, amount} = await loadFixture(deploy);

        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 60))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount, 0, anyValue);

        await timeMachine(1);

        await expect(fanToArtistStaking.connect(addr1).redeem(artist1.address, addr1.address, 0))
            .to.emit(fanToArtistStaking, 'StakeRedeemed')
            .withArgs(artist1.address, addr1.address, 0);

        await expect(Web3MusicNativeToken.connect(addr1).transfer(owner.address, amount)).to.revertedWith("Web3MusicNativeToken: transfer amount exceeds balance");

        await timeMachine(29);

        await expect(Web3MusicNativeToken.connect(addr1).transfer(owner.address, amount/2n)).to.emit(Web3MusicNativeToken, "Transfer");
        await expect(Web3MusicNativeToken.connect(addr1).transfer(owner.address, amount/2n)).to.revertedWith("Web3MusicNativeToken: transfer amount exceeds balance");

        await timeMachine(30);
        await expect(Web3MusicNativeToken.connect(addr1).transfer(owner.address, amount/2n)).to.emit(Web3MusicNativeToken, "Transfer");
    });

    it('User should be able to stake locked and unlocked tokens', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, addr2, artist1, artist2, amount} = await loadFixture(deploy);
        await Web3MusicNativeToken.connect(owner).mint(addr1.address, amount*2n);

        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount*3n, 60))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount*3n, 0, anyValue);

        await timeMachine(1);

        await expect(fanToArtistStaking.connect(addr1).redeem(artist1.address, addr1.address, 0))
            .to.emit(fanToArtistStaking, 'StakeRedeemed')
            .withArgs(artist1.address, addr1.address, 0);

        await expect(Web3MusicNativeToken.connect(addr1).transfer(owner.address, amount*3n)).to.revertedWith("Web3MusicNativeToken: transfer amount exceeds balance");
        await expect(Web3MusicNativeToken.connect(addr1).transfer(owner.address, amount*2n)).to.emit(Web3MusicNativeToken, "Transfer");
        await expect(Web3MusicNativeToken.connect(addr1).transfer(owner.address, amount*2n)).to.revertedWith("Web3MusicNativeToken: transfer amount exceeds balance");

        await timeMachine(59);
        await expect(Web3MusicNativeToken.connect(addr1).transfer(owner.address, amount)).to.emit(Web3MusicNativeToken, "Transfer");
    });

    it('User should be able to stake unlocked tokens', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, owner, addr2, artist1, artist2, amount} = await loadFixture(deploy);
        await Web3MusicNativeToken.connect(owner).mint(addr2.address, amount*2n);

        await expect(fanToArtistStaking.connect(addr2).stake(artist1.address, amount*2n, 60))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr2.address, amount*2n, 0, anyValue);

        await expect(Web3MusicNativeToken.connect(addr2).transfer(owner.address, amount*2n)).to.revertedWith('ERC20: transfer amount exceeds balance');

        await timeMachine(1);

        await expect(fanToArtistStaking.connect(addr2).redeem(artist1.address, addr2.address, 0))
            .to.emit(fanToArtistStaking, 'StakeRedeemed')
            .withArgs(artist1.address, addr2.address, 0);

        await expect(Web3MusicNativeToken.connect(addr2).transfer(owner.address, amount*2n)).to.emit(Web3MusicNativeToken, "Transfer");
    });
});