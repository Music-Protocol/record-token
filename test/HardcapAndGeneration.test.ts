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

        const FTAS = await ethers.getContractFactory('FanToArtistStaking');
        const fanToArtistStaking = await FTAS.deploy();
        await fanToArtistStaking.deployed();

        const cWeb3MusicNativeToken = await ethers.getContractFactory('Web3MusicNativeToken');
        const Web3MusicNativeToken = await cWeb3MusicNativeToken.deploy(fanToArtistStaking.address) as Web3MusicNativeToken;
        await Web3MusicNativeToken.deployed();
        await fanToArtistStaking.initialize(Web3MusicNativeToken.address, defVeReward, defArtistReward, 10, 86400);

        return { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, addr2, artist1, artist2 }
    }

    it.only('Tryng redeem', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, addr2, artist1, artist2 } = await loadFixture(deploy);
        const blockBefore = await ethers.provider.getBlock(await ethers.provider.getBlockNumber());

        await expect(Web3MusicNativeToken.connect(owner).mint_and_lock(addr1.address, 50n*10n**18n, blockBefore.timestamp, 3600)).emit(Web3MusicNativeToken, "Transfer");

        await expect(fanToArtistStaking.addArtist(artist1.address, owner.address))
            .to.emit(fanToArtistStaking, 'ArtistAdded')
            .withArgs(artist1.address, owner.address);
        
        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, 50n*10n**18n, 60))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, 50n*10n**18n, 0, anyValue);
        
        console.log(await Web3MusicNativeToken.getReleasableBalance(addr1.address));
        console.log(await Web3MusicNativeToken.getReleasablePaymentBalance(addr1.address));

        await timeMachine(1);
        await fanToArtistStaking.connect(addr1).redeem(artist1.address, addr1.address, 0);

        console.log(await Web3MusicNativeToken.getReleasableBalance(addr1.address));
        console.log(await Web3MusicNativeToken.getReleasablePaymentBalance(addr1.address));

        console.log(await Web3MusicNativeToken.balanceOf(addr1.address));
    });
});