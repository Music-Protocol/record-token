import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { FanToArtistStaking, Web3MusicNativeToken } from '../typechain-types/index';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { getTimestamp } from './utils/utils';

describe("Hardcap", function () {
    
    async function deployToken() {
        const [owner, addr1, addr2, artist1, artist2] = await ethers.getSigners();
        const defVeReward = 10;
        const defArtistReward = 10;
        const FTAS = await ethers.getContractFactory('FanToArtistStaking');
        const fanToArtistStaking = await upgrades.deployProxy(FTAS.connect(owner), [], {initializer: false, kind: 'uups', timeout: 180000}) as unknown as FanToArtistStaking;
        await fanToArtistStaking.deployed();

        const cWeb3MusicNativeToken = await ethers.getContractFactory('Web3MusicNativeToken');
        const Web3MusicNativeToken = await cWeb3MusicNativeToken.deploy(fanToArtistStaking.address) as Web3MusicNativeToken;
        await Web3MusicNativeToken.deployed();
        await fanToArtistStaking.initialize(Web3MusicNativeToken.address, defVeReward, defArtistReward, 86400, 3, 600);

        return { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, addr2, artist1, artist2 }
    }

    it('It is not possible to mint more than one billion tokens', async () => {
        const { Web3MusicNativeToken, owner } = await loadFixture(deployToken);

        await expect(Web3MusicNativeToken.connect(owner).mint(owner.address, 1000000000000000000000000000n)).emit(Web3MusicNativeToken, "Transfer");

        await expect(Web3MusicNativeToken.connect(owner).mint(owner.address, 1))
            .to.be.revertedWith("Web3MusicNativeToken: Maximum limit of mintable tokens reached") 

        await expect(Web3MusicNativeToken.connect(owner).mint_and_lock(owner.address, 1, await getTimestamp(), 3600))
            .to.be.revertedWith("Web3MusicNativeToken: Maximum limit of mintable tokens reached") 
    });

    it('Pay has no limit', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, addr2, artist1  } = await loadFixture(deployToken);
        const amount = 1000000000000000000000000000n;
        await expect(Web3MusicNativeToken.connect(owner).mint(addr1.address, amount))
            .emit(Web3MusicNativeToken, "Transfer");

        await expect(Web3MusicNativeToken.connect(owner).mint(addr1.address, 1))
            .to.be.revertedWith("Web3MusicNativeToken: Maximum limit of mintable tokens reached");

        await expect(fanToArtistStaking.addArtist(artist1.address, owner.address))
            .to.emit(fanToArtistStaking, 'ArtistAdded')
            .withArgs(artist1.address, owner.address);

        await expect(Web3MusicNativeToken.connect(addr1).approve(fanToArtistStaking.address, amount));
        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 60))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount, anyValue);

        await expect(fanToArtistStaking.connect(artist1).getReward(artist1.address)).to.emit(Web3MusicNativeToken, 'Transfer');
    });

});