import { expect } from 'chai';
import { ethers, web3, upgrades } from 'hardhat';
import { ArtistStaking, MusicProtocolRECORDToken, MusicProtocolDAO } from '../typechain-types/index';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { timeMachine } from './utils/utils';
import { mine } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("DAO whitelist mode", function () {
    let owner: SignerWithAddress;
    let users: SignerWithAddress[]; //5
    let artists: SignerWithAddress[]; //5
    let otherUser: SignerWithAddress;
    let FTAS, ArtistStaking: ArtistStaking;
    let cMusicProtocolRECORDToken, MusicProtocolRECORDToken: MusicProtocolRECORDToken;
    let DAO, dao: MusicProtocolDAO;
    let amount = 10n * 10n ** 18n;
    let calldata: string;
    let description: string;
    let nounce: bigint = 0n;
    const defArtistReward = 10;

    before(async () => {
        const signers = await ethers.getSigners();
        owner = signers[0];
        users = signers.slice(1, 6);
        artists = signers.slice(6, 11);
        otherUser = signers[11];

        calldata = web3.eth.abi.encodeFunctionCall({
            name: 'acceptOwnership',
            type: 'function',
            inputs: []
        }, []);

        FTAS = await ethers.getContractFactory('ArtistStaking');
        ArtistStaking = await upgrades.deployProxy(FTAS.connect(owner), [], { initializer: false, kind: 'uups', timeout: 180000 }) as unknown as ArtistStaking;
        await ArtistStaking.deployed();

        cMusicProtocolRECORDToken = await ethers.getContractFactory('MusicProtocolRECORDToken');
        MusicProtocolRECORDToken = await cMusicProtocolRECORDToken.deploy(ArtistStaking.address);
        await MusicProtocolRECORDToken.deployed();

        DAO = await ethers.getContractFactory('MusicProtocolDAO');
        dao = await DAO.deploy(ArtistStaking.address, 10e7, 50e7 + 1, 900, true);
        await dao.deployed();

        await ArtistStaking.initialize(MusicProtocolRECORDToken.address, defArtistReward, 10, 86400, 3, 600);

        expect(users.length).equal(5);
        expect(artists.length).equal(5);

        await dao.manageWhitelist(users[0].address, true);
        await dao.manageWhitelist(users[1].address, true);
        await dao.manageWhitelist(users[2].address, true);

        await Promise.allSettled(users.map(user => {
            MusicProtocolRECORDToken.connect(owner).mint(user.address, amount);
        }));

        await Promise.allSettled(users.map(user => {
            MusicProtocolRECORDToken.connect(user).approve(ArtistStaking.address, amount)
        }));

        await Promise.allSettled(artists.map(artist => {
            ArtistStaking.addArtist(artist.address, owner.address);
        }));

        await Promise.allSettled(users.map((user, index) => {
            ArtistStaking.connect(user).stake(artists[index].address, amount, 3600);
        }));

        await MusicProtocolRECORDToken.connect(owner).transferOwnership(dao.address); //give ownership of MusicProtocolRECORDToken to dao

        await mine(1);

        await dao.propose([MusicProtocolRECORDToken.address], [calldata], "transfer ownership");
        nounce += 1n;

        await expect(dao.connect(users[0]).vote([MusicProtocolRECORDToken.address], [calldata], nounce, "transfer ownership", true))
            .emit(dao, "ProposalVoted")
            .withArgs(
                anyValue,
                users[0].address,
                await ArtistStaking.getVotes(users[0].address),
                true
            );
        await dao.connect(users[1]).vote([MusicProtocolRECORDToken.address], [calldata], nounce, "transfer ownership", true);
        await dao.connect(users[2]).vote([MusicProtocolRECORDToken.address], [calldata], nounce, "transfer ownership", true);

        await timeMachine(15);

        await expect(dao.execute([MusicProtocolRECORDToken.address], [calldata], nounce, "transfer ownership")).emit(dao, "ProposalExecuted").withArgs(anyValue, anyValue, true);

        //PROPOSAL DATA
        calldata = web3.eth.abi.encodeFunctionCall({
            name: 'mint',
            type: 'function',
            inputs: [{
                type: 'address',
                name: 'to'
            }, {
                type: 'uint256',
                name: 'amount'
            }]
        }, [users[3].address, `1000`]);
        description = "I want tokens!";
    });

    it('A user cannot make or increase a stake with amount equal to 0', async () => {
        await expect(ArtistStaking.connect(users[0]).stake(artists[1].address, 0, 3600)).revertedWith("ArtistStaking: the amount can not be zero");
        await expect(ArtistStaking.connect(users[0]).increaseAmountStaked(artists[0].address, 0)).revertedWith("ArtistStaking: the amount can not be zero");
    });

    it('A user cannot add/remove to/from whitelist another user', async () => {
        await expect(dao.connect(users[0]).manageWhitelist(users[1].address, false)).revertedWith("Ownable: caller is not the owner");
        await expect(dao.connect(users[0]).manageWhitelist(otherUser.address, true)).revertedWith("Ownable: caller is not the owner");
    });

    it('A user can make proposal also if he is not whitelisted', async () => {
        await expect(dao.connect(users[3]).propose([MusicProtocolRECORDToken.address], [calldata], description)).emit(dao, "ProposalCreated"); //2
        nounce++;
    });

    it('Propose must respect length format', async () => {
        await expect(dao.connect(users[3]).propose([MusicProtocolRECORDToken.address], [calldata, calldata], description)).revertedWith("DAO: invalid proposal length");
    });

    it('A user whitelisted can vote', async () => {
        await expect(dao.connect(users[0]).vote([MusicProtocolRECORDToken.address], [calldata], nounce, description, true)).emit(dao, "ProposalVoted");
    });

    it('A user not whitelisted cannot vote', async () => {
        await expect(dao.connect(users[3]).vote([MusicProtocolRECORDToken.address], [calldata], nounce, description, true)).revertedWith("DAO: user not whitelisted");
    });

    it('A user cannot vote twice', async () => {
        await expect(dao.connect(users[0]).vote([MusicProtocolRECORDToken.address], [calldata], nounce, description, true)).revertedWith("DAO: already voted");
    });

    it('A proposal can be executed', async () => {
        await expect(dao.connect(users[1]).vote([MusicProtocolRECORDToken.address], [calldata], nounce, description, true)).emit(dao, "ProposalVoted");
        await expect(dao.connect(users[2]).vote([MusicProtocolRECORDToken.address], [calldata], nounce, description, false)).emit(dao, "ProposalVoted");

        await timeMachine(20);
        await expect(dao.connect(owner).execute([MusicProtocolRECORDToken.address], [calldata], nounce, description)).emit(dao, "ProposalExecuted").withArgs(anyValue, anyValue, true);

        expect(await MusicProtocolRECORDToken.balanceOf(users[3].address)).equal(1000);
    });

    it('A proposal that has not been voted cannot be executed', async () => {
        await expect(dao.connect(users[0]).propose([MusicProtocolRECORDToken.address], [calldata], description)).emit(dao, "ProposalCreated"); //3
        nounce++;

        await timeMachine(20);

        await expect(dao.connect(owner).execute([MusicProtocolRECORDToken.address], [calldata], nounce, description)).emit(dao, "ProposalExecuted").withArgs(anyValue, anyValue, false);
    });

    it('Quorum is reached if the number of voters is greater than half of the whitelisted members at the proposal initialization', async () => {
        await expect(dao.connect(users[0]).propose([MusicProtocolRECORDToken.address], [calldata], description)).emit(dao, "ProposalCreated"); //4
        nounce++;
        await expect(dao.connect(users[1]).vote([MusicProtocolRECORDToken.address], [calldata], nounce, description, true)).emit(dao, "ProposalVoted");
        await expect(dao.connect(users[2]).vote([MusicProtocolRECORDToken.address], [calldata], nounce, description, true)).emit(dao, "ProposalVoted");
        await timeMachine(20);
        await expect(dao.execute([MusicProtocolRECORDToken.address], [calldata], 4, description)).emit(dao, "ProposalExecuted").withArgs(anyValue, anyValue, true);
    });

    it('Propose doesn\'t pass if the amount of negative votes are greater than the amount of the positive votes', async () => {
        await expect(dao.connect(users[0]).propose([MusicProtocolRECORDToken.address], [calldata], description)).emit(dao, "ProposalCreated"); //5
        nounce++;
        await expect(dao.connect(users[0]).vote([MusicProtocolRECORDToken.address], [calldata], nounce, description, true)).emit(dao, "ProposalVoted");
        await expect(dao.connect(users[1]).vote([MusicProtocolRECORDToken.address], [calldata], nounce, description, false)).emit(dao, "ProposalVoted");
        await expect(dao.connect(users[2]).vote([MusicProtocolRECORDToken.address], [calldata], nounce, description, false)).emit(dao, "ProposalVoted");
        await timeMachine(20);
        await expect(dao.execute([MusicProtocolRECORDToken.address], [calldata], nounce, description)).emit(dao, "ProposalExecuted").withArgs(anyValue, anyValue, false);
    });

    it('Owner should not be able to add/remove users already added/removed', async () => {
        await expect(dao.connect(owner).manageWhitelist(users[0].address, true)).revertedWith("DAO: already added/removed.");
        await dao.connect(owner).manageWhitelist(users[1].address, false);
        await expect(dao.connect(owner).manageWhitelist(users[1].address, false)).revertedWith("DAO: already added/removed.");
    })

    it('Proposals created while the whitelist was empty should not be executed. ', async () => {
        await dao.connect(owner).manageWhitelist(users[0].address, false);
        await dao.connect(owner).manageWhitelist(users[2].address, false);
        //Now whitelist is empty
        await expect(dao.connect(users[3]).propose([MusicProtocolRECORDToken.address], [calldata], description)).emit(dao, "ProposalCreated");
        nounce++;
        await timeMachine(20);
        await expect(dao.execute([MusicProtocolRECORDToken.address], [calldata], nounce, description)).emit(dao, "ProposalExecuted").withArgs(anyValue, anyValue, false);
    })

    it('Proposals created while the whitelist was empty should not be executed even if someone later votes for them.', async () => {
        await expect(dao.connect(users[3]).propose([MusicProtocolRECORDToken.address], [calldata], description)).emit(dao, "ProposalCreated");
        nounce++

        await dao.connect(owner).manageWhitelist(users[0].address, true);
        await expect(dao.connect(users[0]).vote([MusicProtocolRECORDToken.address], [calldata], nounce, description, true)).to.emit(dao, "ProposalVoted");

        await timeMachine(20);
        await expect(dao.execute([MusicProtocolRECORDToken.address], [calldata], nounce, description)).emit(dao, "ProposalExecuted").withArgs(anyValue, anyValue, false);
    })

});
