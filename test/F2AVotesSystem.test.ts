import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { ArtistStaking, MusicProtocolRECORDToken } from '../typechain-types/index';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { getTimestamp, timeMachine } from './utils/utils';
import { mine } from "@nomicfoundation/hardhat-network-helpers";

describe("Voting Power", function () {

    async function deploy() {
        const [owner, addr1, addr2, addr3, artist1, artist2, artist3] = await ethers.getSigners();
        const defArtistReward = 10;
        const amount = 10n * 10n ** 18n;

        const FTAS = await ethers.getContractFactory('ArtistStaking');
        const ArtistStaking = await upgrades.deployProxy(FTAS.connect(owner), [], { initializer: false, kind: 'uups', timeout: 180000 }) as unknown as ArtistStaking;
        await ArtistStaking.deployed();

        const cMusicProtocolRECORDToken = await ethers.getContractFactory('MusicProtocolRECORDToken');
        const MusicProtocolRECORDToken = await cMusicProtocolRECORDToken.deploy(ArtistStaking.address) as MusicProtocolRECORDToken;
        await MusicProtocolRECORDToken.deployed();

        await ArtistStaking.initialize(MusicProtocolRECORDToken.address, defArtistReward, 10, 86400, 3, 600);

        await MusicProtocolRECORDToken.connect(owner).mint(addr1.address, amount);
        await MusicProtocolRECORDToken.connect(owner).mint(addr2.address, amount);

        await ArtistStaking.addArtist(artist1.address, owner.address);
        await ArtistStaking.addArtist(artist2.address, owner.address);
        await ArtistStaking.addArtist(artist3.address, owner.address);

        return { MusicProtocolRECORDToken, ArtistStaking, owner, addr1, addr2, addr3, artist1, artist2, artist3, amount }
    }

    it('The total number of votes in circulation to this block can be returned', async () => {
        const { MusicProtocolRECORDToken, ArtistStaking, addr1, addr2, artist1, amount } = await loadFixture(deploy);

        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount / 2n));
        await expect(MusicProtocolRECORDToken.connect(addr2).approve(ArtistStaking.address, amount / 2n));

        await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount / 2n, 60))
            .to.emit(ArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount / 2n, anyValue);
        await expect(ArtistStaking.connect(addr2).stake(artist1.address, amount / 2n, 60))
            .to.emit(ArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr2.address, amount / 2n, anyValue);

        expect(await ArtistStaking.getTotalSupply()).to.equal(amount)
    });

    it('The amount of votes held by an address can be returned', async () => {
        const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, amount } = await loadFixture(deploy);

        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount / 2n));

        await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount / 2n, 60))
            .to.emit(ArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount / 2n, anyValue);

        expect(await ArtistStaking.getVotes(addr1.address)).to.equal(amount / 2n);

    });

    it('Correct voting power for each block', async () => {
        const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, amount } = await loadFixture(deploy);

        //BLOCK 1
        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount / 2n));
        await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount / 2n, 60))
            .to.emit(ArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount / 2n, anyValue);
        const block1 = await ethers.provider.getBlockNumber();

        expect(await MusicProtocolRECORDToken.balanceOf(ArtistStaking.address)).to.equal(amount / 2n);
        expect(await MusicProtocolRECORDToken.balanceOf(addr1.address)).to.equal(amount / 2n);
        expect(await ArtistStaking.getVotes(addr1.address)).to.equal(amount / 2n); //block 1

        await mine(1);
        await timeMachine(1);

        //BLOCK 2
        await expect(ArtistStaking.connect(addr1).redeem(artist1.address))
            .to.emit(ArtistStaking, 'StakeRedeemed')
            .withArgs(artist1.address, addr1.address);
        const block2 = await ethers.provider.getBlockNumber();

        expect(await ArtistStaking.getVotes(addr1.address)).to.equal(0); //block 2
        expect(await ArtistStaking.getPastVotes(addr1.address, block1)).to.equal(amount / 2n); //block 1

        await mine(1)

        //BLOCK 3
        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount / 3n));
        await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount / 3n, 60))
            .to.emit(ArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount / 3n, anyValue);

        expect(await ArtistStaking.getVotes(addr1.address)).to.be.equal(amount / 3n); //block3
        expect(await ArtistStaking.getPastVotes(addr1.address, block1)).to.be.equal(amount / 2n); //block1
        expect(await ArtistStaking.getPastVotes(addr1.address, block2)).to.be.equal(0); //block2

    });

    it('Correct voting power when a stake is increased', async () => {
        const { MusicProtocolRECORDToken, ArtistStaking, addr1, artist1, amount } = await loadFixture(deploy);

        //BLOCK 1
        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount / 2n));
        await expect(ArtistStaking.connect(addr1).stake(artist1.address, amount / 2n, 600))
            .to.emit(ArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount / 2n, anyValue);

        const block1 = await ethers.provider.getBlockNumber();
        expect(await MusicProtocolRECORDToken.balanceOf(ArtistStaking.address)).to.equal(amount / 2n);
        expect(await MusicProtocolRECORDToken.balanceOf(addr1.address)).to.equal(amount / 2n);
        expect(await ArtistStaking.getVotes(addr1.address)).to.equal(amount / 2n); //block 1

        await mine(1);

        //BLOCK 2
        await expect(MusicProtocolRECORDToken.connect(addr1).approve(ArtistStaking.address, amount / 3n));
        await expect(ArtistStaking.connect(addr1).increaseAmountStaked(artist1.address, amount / 3n))
            .to.emit(ArtistStaking, "StakeIncreased")
            .withArgs(artist1.address, addr1.address, amount / 3n);

        expect(await ArtistStaking.getVotes(addr1.address)).to.equal(amount / 2n + amount / 3n);
        expect(await ArtistStaking.getPastVotes(addr1.address, block1)).to.equal(amount / 2n); //block 1

    });

    it('A user cannot delegate other accounts', async () => {
        const { ArtistStaking, addr1, addr2 } = await loadFixture(deploy);
        expect(ArtistStaking.connect(addr1).delegate(addr2.address)).revertedWith("ArtistStaking: users cannot delegate other accounts.");
    });

    it('A user cannot delegate other accounts with delegateBySig', async () => {
        const { ArtistStaking, addr1, addr2, owner } = await loadFixture(deploy);

        const delegatee = addr2.address;
        const nonce = await ArtistStaking.nonces(addr1.address);
        const expiry = await getTimestamp() + 3600;

        const message = ethers.utils.solidityPack(
            ['address', 'uint256', 'uint256'],
            [delegatee, nonce, expiry]
        );

        const signature = await addr1.signMessage(message);
        const { v, r, s } = ethers.utils.splitSignature(signature);

        await expect(ArtistStaking.connect(addr1).delegateBySig(addr2.address, nonce, expiry, v, r, s)).to.rejectedWith("ArtistStaking: users cannot delegate other accounts.")
    });
});