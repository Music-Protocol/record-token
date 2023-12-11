import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers, web3 } from 'hardhat';
import { FanToArtistStaking, Web3MusicNativeToken } from '../typechain-types/index';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { timeMachine } from './utils/utils';
import { BigNumber } from 'ethers';

describe("TGE Management", function () {

    const calldata = web3.eth.abi.encodeFunctionCall({
        name: 'acceptOwnership',
        type: 'function',
        inputs: []
    }, []);

    const daoCalldata3 = web3.eth.abi.encodeFunctionCall({
        name: 'switchWhitelist',
        type: 'function',
        inputs: [{
            type: 'bool',
            name: 'whitelist'
            }]
        }, ['false']);

    async function deploy() {
        const [owner, addr1, addr2, artist1] = await ethers.getSigners();
        const blockBefore = await ethers.provider.getBlock(await ethers.provider.getBlockNumber());

        const FTAS = await ethers.getContractFactory('FanToArtistStaking');
        const fanToArtistStaking = await FTAS.deploy();
        await fanToArtistStaking.deployed();

        const cWeb3MusicNativeToken = await ethers.getContractFactory('Web3MusicNativeToken');
        const Web3MusicNativeToken = await cWeb3MusicNativeToken.deploy(fanToArtistStaking.address) as Web3MusicNativeToken;
        await Web3MusicNativeToken.deployed();

        await fanToArtistStaking.initialize(Web3MusicNativeToken.address, 10, 10, 86400, 3, 10);

        const cWeb3MusicNativeTokenManagement = await ethers.getContractFactory('Web3MusicNativeTokenManagement');
        const Web3MusicNativeTokenManagement = await cWeb3MusicNativeTokenManagement.deploy(Web3MusicNativeToken.address, fanToArtistStaking.address);
        await Web3MusicNativeTokenManagement.deployed();

        const cDAO = await ethers.getContractFactory('Web3MusicNetworkDAO');
        const dao = await cDAO.deploy(fanToArtistStaking.address, 10e7, 50e7 + 1, 900, true);
        await dao.deployed();

        await Web3MusicNativeToken.transferOwnership(Web3MusicNativeTokenManagement.address);
        await fanToArtistStaking.transferOwnership(Web3MusicNativeTokenManagement.address);
        await dao.transferOwnership(Web3MusicNativeTokenManagement.address);
        await Web3MusicNativeTokenManagement.custom([Web3MusicNativeToken.address, fanToArtistStaking.address, dao.address], [calldata, calldata, calldata]);

        const adminRole = await Web3MusicNativeTokenManagement.DEFAULT_ADMIN_ROLE();
        const tgeRole = await Web3MusicNativeTokenManagement.TGE_ROLE();
        const verifyArtistRole = await Web3MusicNativeTokenManagement.VERIFY_ARTIST_ROLE();

        const daoCalldata1 = web3.eth.abi.encodeFunctionCall({
            name: 'manageWhitelist',
            type: 'function',
            inputs: [{
                type: 'address',
                name: 'target'
                },{
                type: 'bool',
                name: 'whitelist'
                }]
            }, [addr1.address, 'true']);

        const daoCalldata2 = web3.eth.abi.encodeFunctionCall({
            name: 'manageWhitelist',
            type: 'function',
            inputs: [{
                type: 'address',
                name: 'target'
                },{
                type: 'bool',
                name: 'whitelist'
                }]
            }, [addr2.address, 'false']);

        return { Web3MusicNativeToken, fanToArtistStaking, Web3MusicNativeTokenManagement, dao, owner, addr1, addr2, artist1, blockBefore, adminRole, tgeRole, verifyArtistRole, daoCalldata1, daoCalldata2}
    }

    it('TgeRole is setted correctly', async () => {
        const { Web3MusicNativeTokenManagement, owner, addr1, tgeRole} = await loadFixture(deploy);
        expect(await Web3MusicNativeTokenManagement.hasRole(tgeRole, owner.address)).to.be.true;
        expect(await Web3MusicNativeTokenManagement.hasRole(tgeRole, addr1.address)).to.be.false;
    });

    it("mint_and_lock is available", async () => {
        const { Web3MusicNativeTokenManagement, Web3MusicNativeToken, owner, addr1, artist1, blockBefore} = await loadFixture(deploy);

        await Web3MusicNativeTokenManagement.connect(owner).addArtist([artist1.address]);

        expect(await Web3MusicNativeTokenManagement.connect(owner).mint_and_lock(addr1.address, 1, blockBefore.timestamp, 3600))
            .to.emit(Web3MusicNativeToken, 'TokenLocked')
            .withArgs(addr1.address, 1);
    });

    it("transfer_and_lock is available", async () => {
        const { Web3MusicNativeTokenManagement, Web3MusicNativeToken, owner, addr1, artist1, blockBefore} = await loadFixture(deploy);

        await Web3MusicNativeTokenManagement.connect(owner).addArtist([artist1.address]);
        await Web3MusicNativeTokenManagement.connect(owner).mint(owner.address, 1n);
        await Web3MusicNativeToken.connect(owner).approve(Web3MusicNativeTokenManagement.address, 1n);

        expect(await Web3MusicNativeTokenManagement.connect(owner).transfer_and_lock(addr1.address, 1n, blockBefore.timestamp, 3600))
            .to.emit(Web3MusicNativeToken, 'TokenLocked')
            .withArgs(addr1.address, 1n);
    });

    describe("Reverts", async () => {
        it("mint_and_lock", async () => {
        const { Web3MusicNativeTokenManagement, addr1, tgeRole, blockBefore} = await loadFixture(deploy);
        await expect(Web3MusicNativeTokenManagement.connect(addr1).mint_and_lock(addr1.address, 1, blockBefore.timestamp, 3600))
            .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${tgeRole}`);
        });
        it("transfer_and_lock", async () => {
        const { Web3MusicNativeTokenManagement, addr1, tgeRole, blockBefore} = await loadFixture(deploy);
        await expect(Web3MusicNativeTokenManagement.connect(addr1).transfer_and_lock(addr1.address, 1, blockBefore.timestamp, 3600))
            .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${tgeRole}`);
        });
    })

    describe("Manage DAO whitelist", async () => {
        it("Manage whitelist", async () => {
            const { Web3MusicNativeTokenManagement, dao, owner, daoCalldata1, daoCalldata2} = await loadFixture(deploy);

            await expect(Web3MusicNativeTokenManagement.connect(owner).custom([dao.address, dao.address],[daoCalldata1, daoCalldata2]))
                .to.emit(dao, 'UserWhitelisted');
        })
        it("Disable whitelist", async () => {
            const { Web3MusicNativeTokenManagement, dao, owner} = await loadFixture(deploy);
    
            await expect(Web3MusicNativeTokenManagement.connect(owner).custom([dao.address],[daoCalldata3]))
                .to.emit(dao, 'WhitelistSwitched');
        })
    });
});