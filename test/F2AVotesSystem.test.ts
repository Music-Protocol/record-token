import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { FanToArtistStaking, Web3MusicNativeToken} from '../typechain-types/index';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { getTimestamp, timeMachine } from './utils/utils';
import { mine } from "@nomicfoundation/hardhat-network-helpers";

describe("Voting Power", function () {

    async function deploy() {
        const [owner, addr1, addr2, addr3, artist1, artist2, artist3] = await ethers.getSigners();
        const defArtistReward = 10;
        const amount = 10n*10n**18n;

        const FTAS = await ethers.getContractFactory('FanToArtistStaking');
        const fanToArtistStaking = await upgrades.deployProxy(FTAS.connect(owner), [], {initializer: false, kind: 'uups', timeout: 180000}) as unknown as FanToArtistStaking;
        await fanToArtistStaking.deployed();

        const cWeb3MusicNativeToken = await ethers.getContractFactory('Web3MusicNativeToken');
        const Web3MusicNativeToken = await cWeb3MusicNativeToken.deploy(fanToArtistStaking.address) as Web3MusicNativeToken;
        await Web3MusicNativeToken.deployed();

        await fanToArtistStaking.initialize(Web3MusicNativeToken.address, defArtistReward, 10, 86400, 3, 600);

        await Web3MusicNativeToken.connect(owner).mint(addr1.address, amount);
        await Web3MusicNativeToken.connect(owner).mint(addr2.address, amount);

        await fanToArtistStaking.addArtist(artist1.address, owner.address);
        await fanToArtistStaking.addArtist(artist2.address, owner.address);
        await fanToArtistStaking.addArtist(artist3.address, owner.address);

        return { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, addr2, addr3, artist1, artist2, artist3, amount }
    }

    it('The total number of votes in circulation to this block can be returned', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, addr1, addr2, artist1, amount } = await loadFixture(deploy);
        
        await expect( Web3MusicNativeToken.connect(addr1).approve(fanToArtistStaking.address, amount/2n));
        await expect( Web3MusicNativeToken.connect(addr2).approve(fanToArtistStaking.address, amount/2n));
        
        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount/2n, 60))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount/2n, anyValue);
        await expect(fanToArtistStaking.connect(addr2).stake(artist1.address, amount/2n, 60))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr2.address, amount/2n, anyValue);

        expect(await fanToArtistStaking.getTotalSupply()).to.equal(amount)
    });

    it('The amount of votes held by an address can be returned', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, amount } = await loadFixture(deploy);
        
        await expect( Web3MusicNativeToken.connect(addr1).approve(fanToArtistStaking.address, amount/2n));

        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount/2n, 60))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount/2n, anyValue);
   
        expect(await fanToArtistStaking.getVotes(addr1.address)).to.equal(amount/2n);

    });

    it('Correct voting power for each block', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, amount } = await loadFixture(deploy);
        
        //BLOCK 1
        await expect( Web3MusicNativeToken.connect(addr1).approve(fanToArtistStaking.address, amount/2n));
        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount/2n, 60))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount/2n, anyValue);
        const block1 = await ethers.provider.getBlockNumber();

        expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(amount/2n);
        expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(amount/2n);
        expect(await fanToArtistStaking.getVotes(addr1.address)).to.equal(amount/2n); //block 1

        await mine(1);
        await timeMachine(1);

        //BLOCK 2
        await expect(fanToArtistStaking.connect(addr1).redeem(artist1.address, addr1.address))
            .to.emit(fanToArtistStaking, 'StakeRedeemed')
            .withArgs(artist1.address, addr1.address);
        const block2 = await ethers.provider.getBlockNumber();

        expect(await fanToArtistStaking.getVotes(addr1.address)).to.equal(0); //block 2
        expect(await fanToArtistStaking.getPastVotes(addr1.address, block1)).to.equal(amount/2n); //block 1

        await mine(1)

        //BLOCK 3
        await expect( Web3MusicNativeToken.connect(addr1).approve(fanToArtistStaking.address, amount/3n));
        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount/3n, 60))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount/3n, anyValue);

        expect(await fanToArtistStaking.getVotes(addr1.address)).to.be.equal(amount/3n); //block3
        expect(await fanToArtistStaking.getPastVotes(addr1.address, block1)).to.be.equal(amount/2n); //block1
        expect(await fanToArtistStaking.getPastVotes(addr1.address, block2)).to.be.equal(0); //block2

    });

    it('Correct voting power when a stake is increased', async () => {
        const { Web3MusicNativeToken,fanToArtistStaking, addr1, artist1, amount } = await loadFixture(deploy);
        
        //BLOCK 1
        await expect( Web3MusicNativeToken.connect(addr1).approve(fanToArtistStaking.address, amount/2n));
        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount/2n, 600))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount/2n, anyValue);
        
        const block1 = await ethers.provider.getBlockNumber();
        expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(amount/2n);
        expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(amount/2n);
        expect(await fanToArtistStaking.getVotes(addr1.address)).to.equal(amount/2n); //block 1

        await mine(1);

        //BLOCK 2
        await expect( Web3MusicNativeToken.connect(addr1).approve(fanToArtistStaking.address, amount/3n));
        await expect(fanToArtistStaking.connect(addr1).increaseAmountStaked(artist1.address, amount/3n))
            .to.emit(fanToArtistStaking, "StakeIncreased")
            .withArgs(artist1.address, addr1.address, amount/3n);

        expect(await fanToArtistStaking.getVotes(addr1.address)).to.equal(amount/2n + amount/3n);
        expect(await fanToArtistStaking.getPastVotes(addr1.address, block1)).to.equal(amount/2n); //block 1

    });

    it('A user cannot delegate other accounts', async () => {
        const { fanToArtistStaking, addr1, addr2 } = await loadFixture(deploy);
        expect(fanToArtistStaking.connect(addr1).delegate(addr2.address)).revertedWith("FanToArtistStaking: users cannot delegate other accounts.");
    });

    it('A user cannot delegate other accounts with delegateBySig', async () => {
        const { fanToArtistStaking, addr1, addr2 } = await loadFixture(deploy);

        const nonce = await fanToArtistStaking.nonces(addr1.address);
        const expiry = await getTimestamp() + 3600;

        const digest = ethers.utils.solidityKeccak256(
            ['address', 'uint256', 'uint256', 'uint8', 'bytes32', 'bytes32'],
            [addr2.address, nonce, expiry, 0, ethers.utils.hexZeroPad('0x0', 32), ethers.utils.hexZeroPad('0x0', 32)]
        );

        const signature = await addr1.signMessage(ethers.utils.arrayify(digest));
        const { v, r, s } = ethers.utils.splitSignature(signature);

        await expect(fanToArtistStaking.delegateBySig(addr2.address, nonce, expiry, v, r, s)).to.revertedWith("FanToArtistStaking: users cannot delegate other accounts.");

    });
    
});