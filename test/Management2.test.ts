import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from 'chai';
import { ethers, web3, upgrades, Web3 } from 'hardhat';
import { ArtistStaking, MusicProtocolRECORDToken } from '../typechain-types/index';
import { getTimestamp, timeMachine } from './utils/utils';

describe("TGE Management", function () {

    const calldata = web3.eth.abi.encodeFunctionCall({
        name: 'acceptOwnership',
        type: 'function',
        inputs: []
    }, []);

    async function deploy() {
        const [owner, addr1, addr2, artist1] = await ethers.getSigners();

        const FTAS = await ethers.getContractFactory('ArtistStaking');
        const ArtistStaking = await upgrades.deployProxy(FTAS.connect(owner), [], { initializer: false, kind: 'uups', timeout: 180000 }) as unknown as ArtistStaking;

        const cMusicProtocolRECORDToken = await ethers.getContractFactory('MusicProtocolRECORDToken');
        const MusicProtocolRECORDToken = await cMusicProtocolRECORDToken.deploy(ArtistStaking.address) as MusicProtocolRECORDToken;
        await MusicProtocolRECORDToken.deployed();

        await ArtistStaking.initialize(MusicProtocolRECORDToken.address, 10, 10, 86400, 3, 600);

        const cMusicProtocolRECORDTokenManagement = await ethers.getContractFactory('MusicProtocolRECORDTokenManagement');
        const MusicProtocolRECORDTokenManagement = await cMusicProtocolRECORDTokenManagement.deploy(MusicProtocolRECORDToken.address, ArtistStaking.address);
        await MusicProtocolRECORDTokenManagement.deployed();

        const cDAO = await ethers.getContractFactory('MusicProtocolDAO');
        const dao = await cDAO.deploy(ArtistStaking.address, 10e7, 50e7 + 1, 900, true);
        await dao.deployed();

        await MusicProtocolRECORDToken.transferOwnership(MusicProtocolRECORDTokenManagement.address);
        await ArtistStaking.transferOwnership(MusicProtocolRECORDTokenManagement.address);
        await dao.transferOwnership(MusicProtocolRECORDTokenManagement.address);
        await MusicProtocolRECORDTokenManagement.custom([MusicProtocolRECORDToken.address, ArtistStaking.address, dao.address], [calldata, calldata, calldata]);

        const adminRole = await MusicProtocolRECORDTokenManagement.DEFAULT_ADMIN_ROLE();
        const tgeRole = await MusicProtocolRECORDTokenManagement.TGE_ROLE();
        const verifyArtistRole = await MusicProtocolRECORDTokenManagement.VERIFY_ARTIST_ROLE();

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

        return { MusicProtocolRECORDToken, ArtistStaking, MusicProtocolRECORDTokenManagement, dao, owner, addr1, addr2, artist1, adminRole, tgeRole, verifyArtistRole, daoCalldata1, daoCalldata2, daoCalldata1false, daoCalldata2false, daoCalldata4 }
    }

    it('TgeRole is setted correctly', async () => {
        const { MusicProtocolRECORDTokenManagement, MusicProtocolRECORDToken, owner, addr1, tgeRole } = await loadFixture(deploy);
        expect(await MusicProtocolRECORDTokenManagement.hasRole(tgeRole, owner.address)).to.be.true;
        expect(await MusicProtocolRECORDTokenManagement.hasRole(tgeRole, addr1.address)).to.be.false;
    });

    it("mint_and_lock is available", async () => {
        const { MusicProtocolRECORDTokenManagement, MusicProtocolRECORDToken, owner, addr1, artist1, tgeRole } = await loadFixture(deploy);

        expect(await MusicProtocolRECORDTokenManagement.grantRole(tgeRole, addr1.address)).to.emit(MusicProtocolRECORDTokenManagement, 'RoleGranted');

        await MusicProtocolRECORDTokenManagement.connect(owner).addArtist([artist1.address]);

        expect(await MusicProtocolRECORDTokenManagement.connect(addr1).mint_and_lock(addr1.address, 1n, await getTimestamp(), 3600))
            .to.emit(MusicProtocolRECORDToken, 'TokenLocked')
            .withArgs(addr1.address, 1);
    });

    it("transfer_and_lock is available", async () => {
        const { MusicProtocolRECORDTokenManagement, MusicProtocolRECORDToken, owner, addr1, artist1 } = await loadFixture(deploy);

        await MusicProtocolRECORDTokenManagement.connect(owner).addArtist([artist1.address]);
        await MusicProtocolRECORDTokenManagement.connect(owner).mint(owner.address, 1n);
        await MusicProtocolRECORDToken.connect(owner).approve(MusicProtocolRECORDTokenManagement.address, 1n);
        expect(await MusicProtocolRECORDTokenManagement.connect(owner).transfer_and_lock(owner.address, addr1.address, 1n, await getTimestamp(), 3600))
            .to.emit(MusicProtocolRECORDToken, 'TokenLocked')
            .withArgs(addr1.address, 1n);
    });

    it("transfer_and_lock is available by admin, if someone approve the tokens he can use them", async () => {
        const { MusicProtocolRECORDTokenManagement, MusicProtocolRECORDToken, owner, addr1, addr2, artist1 } = await loadFixture(deploy);

        await MusicProtocolRECORDTokenManagement.connect(owner).addArtist([artist1.address]);
        await MusicProtocolRECORDTokenManagement.mint(addr1.address, 100n);
        //An address can approve a transfer to the management, then the management can create a transfer_and_lock.
        await MusicProtocolRECORDToken.connect(addr1).approve(MusicProtocolRECORDTokenManagement.address, 100n);
        expect(await MusicProtocolRECORDTokenManagement.transfer_and_lock(addr1.address, addr2.address, 100n, await getTimestamp(), 3600))
            .to.emit(MusicProtocolRECORDToken, 'TokenLocked')
            .withArgs(addr1.address, addr2.address, 100n);
    });

    it("transfer_and_lock is available by TGE admin", async () => {
        const { MusicProtocolRECORDTokenManagement, MusicProtocolRECORDToken, owner, addr1, addr2, artist1, tgeRole } = await loadFixture(deploy);

        await MusicProtocolRECORDTokenManagement.addArtist([artist1.address]);
        await MusicProtocolRECORDTokenManagement.grantRole(tgeRole, addr1.address);
        await MusicProtocolRECORDTokenManagement.mint(addr1.address, 100n);
        //An address can approve a transfer to the management, then the management can create a transfer_and_lock.
        await MusicProtocolRECORDToken.connect(addr1).approve(MusicProtocolRECORDTokenManagement.address, 100n);
        expect(await MusicProtocolRECORDTokenManagement.connect(addr1).transfer_and_lock(addr1.address, addr2.address, 100n, await getTimestamp(), 3600))
            .to.emit(MusicProtocolRECORDToken, 'TokenLocked')
            .withArgs(addr1.address, addr2.address, 100n);
    });

    it("Owner should be able to change artist reward rate", async () => {
        const { MusicProtocolRECORDTokenManagement, ArtistStaking, owner } = await loadFixture(deploy);
        await timeMachine(10);
        await expect(MusicProtocolRECORDTokenManagement.connect(owner).changeArtistRewardRate(4)).to.emit(ArtistStaking, "ArtistMusicProtocolRECORDTokenRewardChanged");
    })

    describe("Reverts", async () => {
        it("mint_and_lock", async () => {
            const { MusicProtocolRECORDTokenManagement, addr1, tgeRole } = await loadFixture(deploy);

            await expect(MusicProtocolRECORDTokenManagement.connect(addr1).mint_and_lock(addr1.address, 1n, await getTimestamp(), 3600))
                .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${tgeRole}`);
        });
        it("transfer_and_lock", async () => {
            const { MusicProtocolRECORDTokenManagement, addr1, tgeRole } = await loadFixture(deploy);

            await expect(MusicProtocolRECORDTokenManagement.connect(addr1).transfer_and_lock(addr1.address, addr1.address, 1n, await getTimestamp(), 3600))
                .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${tgeRole}`);
        });

        it("Only DEFAULT_ADMIN_ROLE should be able to change artist reward rate", async () => {
            const { MusicProtocolRECORDTokenManagement, ArtistStaking, addr1, adminRole } = await loadFixture(deploy);

            await expect(MusicProtocolRECORDTokenManagement.connect(addr1).changeArtistRewardRate(4))
                .to.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${adminRole}`);
        })

        it("Only DEFAULT_ADMIN_ROLE should be able to change artist reward rate", async () => {
            const { MusicProtocolRECORDTokenManagement, dao, ArtistStaking, addr1, adminRole, daoCalldata1 } = await loadFixture(deploy);

            await expect(MusicProtocolRECORDTokenManagement.connect(addr1).custom([dao.address], [daoCalldata1]))
                .to.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${adminRole}`);
        })

    })

    describe("Manage DAO whitelist", async () => {
        it("Manage whitelist", async () => {
            const { MusicProtocolRECORDTokenManagement, dao, addr1, addr2, owner, daoCalldata1, daoCalldata2, daoCalldata1false, daoCalldata2false } = await loadFixture(deploy);

            await expect(MusicProtocolRECORDTokenManagement.connect(owner).custom([dao.address], [daoCalldata1]))
                .to.emit(dao, 'UserWhitelisted').withArgs(addr1.address, true);
            await expect(MusicProtocolRECORDTokenManagement.connect(owner).custom([dao.address], [daoCalldata2]))
                .to.emit(dao, 'UserWhitelisted').withArgs(addr2.address, true);
            await expect(MusicProtocolRECORDTokenManagement.connect(owner).custom([dao.address], [daoCalldata1false]))
                .to.emit(dao, 'UserWhitelisted').withArgs(addr1.address, false);
            await expect(MusicProtocolRECORDTokenManagement.connect(owner).custom([dao.address], [daoCalldata2false]))
                .to.emit(dao, 'UserWhitelisted').withArgs(addr2.address, false);
        })
        it("Propose and vote", async () => {
            const { dao, addr1, addr2, owner, MusicProtocolRECORDToken, MusicProtocolRECORDTokenManagement, daoCalldata1, daoCalldata2, daoCalldata4 } = await loadFixture(deploy);

            await expect(MusicProtocolRECORDTokenManagement.connect(owner).custom([dao.address], [daoCalldata1]))
                .to.emit(dao, 'UserWhitelisted').withArgs(addr1.address, true);
            await expect(dao.connect(addr1).propose([MusicProtocolRECORDToken.address], [daoCalldata4], "Mint 1000 to owner."))
                .to.emit(dao, "ProposalCreated");
            await expect(dao.connect(addr1).vote([MusicProtocolRECORDToken.address], [daoCalldata4], 1, "Mint 1000 to owner.", true))
                .to.emit(dao, "ProposalVoted");
        })
        describe("Reverts", async () => {

            it("User not whitelisted should not be able to vote", async () => {
                const { dao, addr1, addr2, owner, MusicProtocolRECORDToken, MusicProtocolRECORDTokenManagement, daoCalldata1, daoCalldata4 } = await loadFixture(deploy);

                await expect(MusicProtocolRECORDTokenManagement.connect(owner).custom([dao.address], [daoCalldata1]))
                    .to.emit(dao, 'UserWhitelisted').withArgs(addr1.address, true);
                await expect(dao.connect(addr1).propose([MusicProtocolRECORDToken.address], [daoCalldata4], "Mint 1000 to owner."))
                    .to.emit(dao, "ProposalCreated");
                await expect(dao.connect(addr2).vote([MusicProtocolRECORDToken.address], [daoCalldata4], 1, "Mint 1000 to owner.", true))
                    .to.revertedWith('DAO: user not whitelisted')
            });
        });
    });
});