import { expect } from 'chai';
import { BytesLike } from 'ethers';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { FanToArtistStaking, JTP, JTPManagement } from '../typechain-types/index';

describe('FanToArtistStaking', function () {
    let jtp: JTP;
    let fanToArtistStaking: FanToArtistStaking;
    let owner: SignerWithAddress, addr1: SignerWithAddress, addr2: SignerWithAddress, addr3: SignerWithAddress, artist1: SignerWithAddress, artist2: SignerWithAddress;

    before(async function () { //same as deploy
        [owner, addr1, addr2, addr3, artist1, artist2] = await ethers.getSigners();

        const FTAS = await ethers.getContractFactory("FanToArtistStaking");
        fanToArtistStaking = await FTAS.deploy();
        await fanToArtistStaking.deployed();

        const cJTP = await ethers.getContractFactory('JTP');
        jtp = await cJTP.deploy(fanToArtistStaking.address);
        await jtp.deployed();
    });

    describe('Deployment', function () {
        it('Should set the right owner', async function () {
            expect(await jtp.owner()).to.equal(owner.address);
        });
    });

    describe('Verified Artist', function () {
        it('Should add the right artist to the verifiedArtists list and emit an event', async function () {
            await expect(fanToArtistStaking.addArtist(artist1.address, addr1.address))
                .to.emit(fanToArtistStaking, "ArtistAdded")
                .withArgs(artist1.address, addr1.address);

            expect(await fanToArtistStaking.isVerified(artist1.address)).to.equal(true);
        });

        it('Should remove the right artist to the verifiedArtists list and emit an event', async function () {
            await expect(fanToArtistStaking.removeArtist(artist1.address, addr1.address))
                .to.emit(fanToArtistStaking, "ArtistRemoved")
                .withArgs(artist1.address, addr1.address);

            expect(await fanToArtistStaking.isVerified(artist1.address)).to.equal(false);
        });

        it('Should return an error if the caller is not the owner', async function () {
            await expect(fanToArtistStaking.connect(addr2).addArtist(artist1.address, addr1.address))
                .to.be.revertedWith('Ownable: caller is not the owner');
        });
    });

});