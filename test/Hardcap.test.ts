import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { ArtistStaking, MusicProtocolRECORDToken } from '../typechain-types/index';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { getTimestamp } from './utils/utils';

describe("Hardcap", function () {

    async function deployToken() {
        const [owner, addr1, addr2, artist1, artist2] = await ethers.getSigners();
        const defVeReward = 10;
        const defArtistReward = 10;
        const FTAS = await ethers.getContractFactory('ArtistStaking');
        const ArtistStaking = await upgrades.deployProxy(FTAS.connect(owner), [], { initializer: false, kind: 'uups', timeout: 180000 }) as unknown as ArtistStaking;
        await ArtistStaking.deployed();

        const cMusicProtocolRECORDToken = await ethers.getContractFactory('MusicProtocolRECORDToken');
        const MusicProtocolRECORDToken = await cMusicProtocolRECORDToken.deploy(ArtistStaking.address) as MusicProtocolRECORDToken;
        await MusicProtocolRECORDToken.deployed();
        await ArtistStaking.initialize(MusicProtocolRECORDToken.address, defVeReward, defArtistReward, 86400, 3, 600);

        return { MusicProtocolRECORDToken, ArtistStaking, owner, addr1, addr2, artist1, artist2 }
    }

    it('It is not possible to mint more than one billion tokens', async () => {
        const { MusicProtocolRECORDToken, owner } = await loadFixture(deployToken);

        await expect(MusicProtocolRECORDToken.connect(owner).mint(owner.address, 1000000000000000000000000000n)).emit(MusicProtocolRECORDToken, "Transfer");

        await expect(MusicProtocolRECORDToken.connect(owner).mint(owner.address, 1))
            .to.be.revertedWith("MusicProtocolRECORDToken: Maximum limit of mintable tokens reached")

        await expect(MusicProtocolRECORDToken.connect(owner).mint_and_lock(owner.address, 1, await getTimestamp(), 3600))
            .to.be.revertedWith("MusicProtocolRECORDToken: Maximum limit of mintable tokens reached")
    });

    it('Pay has no limit', async () => {
        const { MusicProtocolRECORDToken, ArtistStaking, owner, addr1, addr2, artist1 } = await loadFixture(deployToken);
        const amount = 1000000000000000000000000000n;
        await expect(MusicProtocolRECORDToken.connect(owner).mint(addr1.address, amount))
            .emit(MusicProtocolRECORDToken, "Transfer");

        await expect(MusicProtocolRECORDToken.connect(owner).mint(addr1.address, 1))
            .to.be.revertedWith("MusicProtocolRECORDToken: Maximum limit of mintable tokens reached");

        await expect(ArtistStaking.addArtist(artist1.address, owner.address))
            .to.emit(ArtistStaking, 'ArtistAdded')
            .withArgs(artist1.address, owner.address);

        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount));
        await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount, 60))
            .to.emit(ArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount, anyValue);

        await expect(ArtistStaking.connect(artist1).getReward(artist1.address)).to.emit(MusicProtocolRECORDToken, 'Transfer');
    });

});