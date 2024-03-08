import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, web3, upgrades } from "hardhat";

const calldata = web3.eth.abi.encodeFunctionCall({
    name: 'acceptOwnership',
    type: 'function',
    inputs: []
}, []);

describe("Constructors", () => {

    async function deploy() {
        const [owner, artist1] = await ethers.getSigners();
        const defVeReward = 10;
        const defArtistReward = 10;
        let FTA, TOK, DAO, MNG;

        FTA = await ethers.getContractFactory('FanToArtistStaking');

        TOK = await ethers.getContractFactory('Web3MusicNativeToken');

        DAO = await ethers.getContractFactory('Web3MusicNetworkDAO');

        MNG = await ethers.getContractFactory('Web3MusicNativeTokenManagement');

        return { FTA , DAO, MNG, TOK, owner, defArtistReward, defVeReward, artist1}
    }

    it("FanToArtistStaking", async () => {
        const { FTA, TOK, defArtistReward, owner } = await loadFixture(deploy);

        const fta = await upgrades.deployProxy(FTA.connect(owner), [], {initializer: false, kind: 'uups', timeout: 180000});
        await fta.deployed();

        const tok = await TOK.deploy(fta.address);
        await tok.deployed();

        await expect(fta.initialize(ethers.constants.AddressZero, defArtistReward, 10, 86400, 3, 600))
            .to.revertedWith("FanToArtistStaking: the Web3MusicNativeToken address can not be 0");

        await expect(fta.initialize(tok.address, 0, 10, 86400, 3, 600))
            .to.revertedWith("FanToArtistStaking: the artist reward rate can not be 0");

        await expect(fta.initialize(tok.address, defArtistReward, 86400, 10, 3, 600))
            .to.revertedWith("FanToArtistStaking: min cant be greater than max");

        await expect(fta.initialize(tok.address, defArtistReward, 10, 86400, 3, 60))
            .to.revertedWith("FanToArtistStaking: the minimum time to change the reward rate is 10 minutes");

        await expect(fta.initialize(tok.address, defArtistReward, 86400, 10, 0, 600))
            .to.revertedWith("FanToArtistStaking: the reward limit must be greater than 0");

        await fta.initialize(tok.address, defArtistReward, 10, 86400, 3, 600);

        await expect(fta.initialize(tok.address, defArtistReward, 10, 86400, 3, 600))
            .to.revertedWith("Initializable: contract is already initialized");

    });

    it("Web3MusicNetworkDAO", async () => {
        const { FTA, TOK, DAO, defArtistReward, owner} = await loadFixture(deploy);

        const fta = await upgrades.deployProxy(FTA.connect(owner), [], {initializer: false, kind: 'uups', timeout: 180000});
        await fta.deployed();

        const tok = await TOK.deploy(fta.address);
        await tok.deployed();

        await fta.initialize(tok.address, defArtistReward, 10, 86400, 3, 600);

        await expect(DAO.deploy(ethers.constants.AddressZero, 10e7, 50e7 + 1, 900, true))
            .to.revertedWith("DAO: the fanToArtistStaking address can not be 0");

        await expect(DAO.deploy(fta.address, 10e9, 50e7 + 1, 900, true))
            .to.revertedWith("DAO: the quorum must be less than or equal 10e8");

        await expect(DAO.deploy(fta.address, 10e7, 10e9, 900, true))
            .to.revertedWith("DAO: the majority must be less than or equal 10e8");

    });

    it("Web3MusicNativeTokenManagement", async () => {
        const { owner, FTA, TOK, MNG, artist1, defArtistReward} =  await loadFixture(deploy);

        const fta1 = await upgrades.deployProxy(FTA.connect(owner), [], {initializer: false, kind: 'uups', timeout: 180000});
        await fta1.deployed();

        const fta2 = await upgrades.deployProxy(FTA.connect(owner), [], {initializer: false, kind: 'uups', timeout: 180000});
        await fta2.deployed();

        const tok1 = await TOK.deploy(fta1.address);
        await tok1.deployed();

        const tok2 = await TOK.deploy(fta1.address);
        await tok2.deployed();

        await fta1.initialize(tok1.address, defArtistReward, 10, 86400, 3, 600);
        await fta2.initialize(tok2.address, defArtistReward, 10, 86400, 3, 600);

        await expect(MNG.deploy(ethers.constants.AddressZero, fta1.address))
            .to.revertedWith("Web3MusicNativeTokenManagement: Web3MusicNativeToken address can not be 0");

        await expect(MNG.deploy(tok1.address, ethers.constants.AddressZero))
            .to.revertedWith("Web3MusicNativeTokenManagement: fanToArtistStaking address can not be 0");

        const mng = await MNG.deploy(tok1.address, fta1.address);

        await expect(mng.changeFTAS(ethers.constants.AddressZero))
            .to.revertedWith("Web3MusicNativeTokenManagement: fanToArtistStaking address can not be 0")

        await expect(mng.changeWeb3MusicNativeToken(ethers.constants.AddressZero))
            .to.revertedWith("Web3MusicNativeTokenManagement: Web3MusicNativeToken address can not be 0")

        //CHANGE SMART CONTRACTS
        await mng.changeFTAS(fta2.address);
        await mng.changeWeb3MusicNativeToken(tok2.address);
        
        //ONLY OWNER CAN CHANGE SMART CONTRACTS
        await expect(mng.connect(artist1).changeFTAS(fta2.address))
            .to.revertedWith(`AccessControl: account ${artist1.address.toLowerCase()} is missing role ${await mng.DEFAULT_ADMIN_ROLE()}`);
        
        await expect(mng.connect(artist1).changeWeb3MusicNativeToken(tok2.address))
            .to.revertedWith(`AccessControl: account ${artist1.address.toLowerCase()} is missing role ${await mng.DEFAULT_ADMIN_ROLE()}`);

        //OWNERSHIP2
        await tok2.transferOwnership(mng.address);
        await fta2.transferOwnership(mng.address);
        await mng.custom([tok2.address, fta2.address], [calldata, calldata]);

        //TEST TOKEN CHANGE
        await mng.connect(owner).mint(owner.address, 1000);
        expect(await tok1.balanceOf(owner.address)).to.equal(0);
        expect(await tok2.balanceOf(owner.address)).to.equal(1000);

        //TEST F2A CHANGE
        await expect(mng.connect(owner).addArtist([artist1.address])).to.emit(fta2, "ArtistAdded"); 
        //If artist 1 was already added to the artist list it would not issue any events
        await expect(fta1.connect(owner).addArtist(artist1.address, owner.address)).to.emit(fta1, "ArtistAdded");

    });
    
    

    
});