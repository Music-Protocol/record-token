import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers, web3 } from 'hardhat';
import { FanToArtistStaking, Web3MusicNativeToken, Web3MusicNativeTokenManagement__factory } from '../typechain-types/index';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { timeMachine } from './utils/utils';
import { BigNumber } from 'ethers';

describe("TGE Management", function () {

    const calldata = web3.eth.abi.encodeFunctionCall({
        name: 'acceptOwnership',
        type: 'function',
        inputs: []
    }, []);

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
            }, {
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
            }, {
                type: 'bool',
                name: 'whitelist'
            }]
        }, [addr2.address, 'true']);

        const daoCalldata1false = web3.eth.abi.encodeFunctionCall({
            name: 'manageWhitelist',
            type: 'function',
            inputs: [{
                type: 'address',
                name: 'target'
            }, {
                type: 'bool',
                name: 'whitelist'
            }]
        }, [addr1.address, '']);

        const daoCalldata2false = web3.eth.abi.encodeFunctionCall({
            name: 'manageWhitelist',
            type: 'function',
            inputs: [{
                type: 'address',
                name: 'target'
            }, {
                type: 'bool',
                name: 'whitelist'
            }]
        }, [addr2.address, '']);

        const daoCalldata4 = web3.eth.abi.encodeFunctionCall(
            {
                name: "mint",
                type: "function",
                inputs: [
                    {
                        type: "address",
                        name: "to",
                    },
                    {
                        type: "uint256",
                        name: "amount",
                    },
                ],
            },
            [owner.address, `1000`]);

        return { Web3MusicNativeToken, fanToArtistStaking, Web3MusicNativeTokenManagement, dao, owner, addr1, addr2, artist1, blockBefore, adminRole, tgeRole, verifyArtistRole, daoCalldata1, daoCalldata2, daoCalldata1false, daoCalldata2false, daoCalldata4 }
    }

    it('TgeRole is setted correctly', async () => {
        const { Web3MusicNativeTokenManagement, Web3MusicNativeToken, owner, addr1, tgeRole, blockBefore} = await loadFixture(deploy);
        expect(await Web3MusicNativeTokenManagement.hasRole(tgeRole, owner.address)).to.be.true;
        expect(await Web3MusicNativeTokenManagement.hasRole(tgeRole, addr1.address)).to.be.false;
    });

    it("mint_and_lock is available", async () => {
        const { Web3MusicNativeTokenManagement, Web3MusicNativeToken, owner, addr1, artist1, tgeRole, blockBefore } = await loadFixture(deploy);

        expect(await Web3MusicNativeTokenManagement.grantRole(tgeRole, addr1.address)).to.emit(Web3MusicNativeTokenManagement, 'RoleGranted');

        await Web3MusicNativeTokenManagement.connect(owner).addArtist([artist1.address]);

        expect(await Web3MusicNativeTokenManagement.connect(addr1).mint_and_lock(addr1.address, 1, blockBefore.timestamp, 3600))
            .to.emit(Web3MusicNativeToken, 'TokenLocked')
            .withArgs(addr1.address, 1);
    });

    it("transfer_and_lock is available", async () => {
        const { Web3MusicNativeTokenManagement, Web3MusicNativeToken, owner, addr1, artist1, blockBefore } = await loadFixture(deploy);

        await Web3MusicNativeTokenManagement.connect(owner).addArtist([artist1.address]);
        await Web3MusicNativeTokenManagement.connect(owner).mint(owner.address, 1n);
        await Web3MusicNativeToken.connect(owner).approve(Web3MusicNativeTokenManagement.address, 1n);

        expect(await Web3MusicNativeTokenManagement.connect(owner).transfer_and_lock(addr1.address, 1n, blockBefore.timestamp, 3600))
            .to.emit(Web3MusicNativeToken, 'TokenLocked')
            .withArgs(addr1.address, 1n);
    });

    it("Owner should be able to change artist reward rate", async () => {
        const { Web3MusicNativeTokenManagement, fanToArtistStaking, owner} = await loadFixture(deploy);
        await timeMachine(1);
        await expect(Web3MusicNativeTokenManagement.connect(owner).changeArtistRewardRate(4)).to.emit(fanToArtistStaking, "ArtistWeb3MusicNativeTokenRewardChanged");
    })

    describe("Reverts", async () => {
        it("mint_and_lock", async () => {
            const { Web3MusicNativeTokenManagement, addr1, tgeRole, blockBefore } = await loadFixture(deploy);
            await expect(Web3MusicNativeTokenManagement.connect(addr1).mint_and_lock(addr1.address, 1, blockBefore.timestamp, 3600))
                .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${tgeRole}`);
        });
        it("transfer_and_lock", async () => {
            const { Web3MusicNativeTokenManagement, addr1, tgeRole, blockBefore } = await loadFixture(deploy);
            await expect(Web3MusicNativeTokenManagement.connect(addr1).transfer_and_lock(addr1.address, 1, blockBefore.timestamp, 3600))
                .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${tgeRole}`);
        });

        it("Only DEFAULT_ADMIN_ROLE should be able to change artist reward rate", async () => {
            const { Web3MusicNativeTokenManagement, fanToArtistStaking, addr1, adminRole} = await loadFixture(deploy);
    
            await expect(Web3MusicNativeTokenManagement.connect(addr1).changeArtistRewardRate(4))
                .to.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${adminRole}`);
        })

        it("Only DEFAULT_ADMIN_ROLE should be able to change artist reward rate", async () => {
            const { Web3MusicNativeTokenManagement, dao, fanToArtistStaking, addr1, adminRole, daoCalldata1} = await loadFixture(deploy);
    
            await expect(Web3MusicNativeTokenManagement.connect(addr1).custom([dao.address], [daoCalldata1]))
                .to.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${adminRole}`);
        })
    
    })

    describe("Manage DAO whitelist", async () => {
        it("Manage whitelist", async () => {
            const { Web3MusicNativeTokenManagement, dao, addr1, addr2, owner, daoCalldata1, daoCalldata2, daoCalldata1false, daoCalldata2false } = await loadFixture(deploy);

            await expect(Web3MusicNativeTokenManagement.connect(owner).custom([dao.address], [daoCalldata1]))
                .to.emit(dao, 'UserWhitelisted').withArgs(addr1.address, true);
            await expect(Web3MusicNativeTokenManagement.connect(owner).custom([dao.address], [daoCalldata2]))
                .to.emit(dao, 'UserWhitelisted').withArgs(addr2.address, true);
            await expect(Web3MusicNativeTokenManagement.connect(owner).custom([dao.address], [daoCalldata1false]))
                .to.emit(dao, 'UserWhitelisted').withArgs(addr1.address, false);
            await expect(Web3MusicNativeTokenManagement.connect(owner).custom([dao.address], [daoCalldata2false]))
                .to.emit(dao, 'UserWhitelisted').withArgs(addr2.address, false);
        })
        it("Propose and vote", async() => {
            const { dao, addr1, addr2, owner, Web3MusicNativeToken, Web3MusicNativeTokenManagement, daoCalldata1, daoCalldata2, daoCalldata4 } = await loadFixture(deploy);

            await expect(Web3MusicNativeTokenManagement.connect(owner).custom([dao.address], [daoCalldata1]))
                .to.emit(dao, 'UserWhitelisted').withArgs(addr1.address, true);
            await expect(dao.connect(addr1).propose([Web3MusicNativeToken.address], [daoCalldata4], "Mint 1000 to owner."))
                .to.emit(dao, "ProposalCreated");
            await expect(dao.connect(addr1).vote([Web3MusicNativeToken.address], [daoCalldata4], "Mint 1000 to owner.", true))
                .to.emit(dao, "ProposalVoted");
        })
        describe("Reverts", async () => {

            it("User not whitelisted should not be able to vote", async () => {
                const { dao, addr1, addr2, owner, Web3MusicNativeToken, Web3MusicNativeTokenManagement, daoCalldata1, daoCalldata4 } = await loadFixture(deploy);
                
                await expect(Web3MusicNativeTokenManagement.connect(owner).custom([dao.address], [daoCalldata1]))
                    .to.emit(dao, 'UserWhitelisted').withArgs(addr1.address, true);
                await expect(dao.connect(addr1).propose([Web3MusicNativeToken.address], [daoCalldata4], "Mint 1000 to owner."))
                    .to.emit(dao, "ProposalCreated");
                await expect(dao.connect(addr2).vote([Web3MusicNativeToken.address], [daoCalldata4], "Mint 1000 to owner.", true))
                    .to.revertedWith('DAO: user not whitelisted')
            });
        });
    });
});