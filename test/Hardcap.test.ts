import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { FanToArtistStaking, Web3MusicNativeToken } from '../typechain-types/index';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { timeMachine } from './utils/utils';
import { BigNumber } from 'ethers';

describe("Hardcap", function () {
    
    async function deployToken() {
        const [owner, addr1, addr2, artist1, artist2] = await ethers.getSigners();
        const defVeReward = 10;
        const defArtistReward = 10;

        const FTAS = await ethers.getContractFactory('FanToArtistStaking');
        const fanToArtistStaking = await FTAS.deploy();
        await fanToArtistStaking.deployed();

        const cWeb3MusicNativeToken = await ethers.getContractFactory('Web3MusicNativeToken');
        const Web3MusicNativeToken = await cWeb3MusicNativeToken.deploy(fanToArtistStaking.address) as Web3MusicNativeToken;
        await Web3MusicNativeToken.deployed();
        await fanToArtistStaking.initialize(Web3MusicNativeToken.address, defVeReward, defArtistReward, 10, 86400);

        return { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, addr2, artist1, artist2 }
    }

    it('It is not possible to mint more than one billion tokens', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, artist1  } = await loadFixture(deployToken);

        await expect(Web3MusicNativeToken.connect(owner).mint(owner.address, 1000000000000000000000000000n)).emit(Web3MusicNativeToken, "Transfer");

        await expect(Web3MusicNativeToken.connect(owner).mint(owner.address, 1))
            .to.be.revertedWith("W3T: Maximum limit of minable tokens reached") 
    });

    it('Pay has no limit', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, addr2, artist1  } = await loadFixture(deployToken);
        const amount = 1000000000000000000000000000n;
        await expect(Web3MusicNativeToken.connect(owner).mint(addr1.address, amount))
            .emit(Web3MusicNativeToken, "Transfer");

        await expect(Web3MusicNativeToken.connect(owner).mint(addr1.address, 1))
            .to.be.revertedWith("W3T: Maximum limit of minable tokens reached");

        await expect(fanToArtistStaking.addArtist(artist1.address, owner.address))
            .to.emit(fanToArtistStaking, 'ArtistAdded')
            .withArgs(artist1.address, owner.address);

        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 60))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount, 0, anyValue);

        await expect(fanToArtistStaking.connect(artist1).getReward(artist1.address, [addr1.address], [0], [0], [10])).to.emit(Web3MusicNativeToken, 'Transfer');
    });

});