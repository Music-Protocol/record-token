import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from 'chai';
import { ethers, network, web3 } from 'hardhat';
import { FanToArtistStaking, Web3MusicNativeToken, Web3MusicNetworkDAO } from '../typechain-types/index';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { timeMachine } from './utils/utils';
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("DAO whitelist mode", function () {
    let owner: SignerWithAddress;
    let users: SignerWithAddress[]; //5
    let artists: SignerWithAddress[]; //5
    let otherUser: SignerWithAddress;
    let FTAS, fanToArtistStaking: FanToArtistStaking;
    let cWeb3MusicNativeToken, Web3MusicNativeToken: Web3MusicNativeToken;
    let DAO, dao: Web3MusicNetworkDAO;
    let amount = 10n * 10n ** 18n;
    let calldata: string;
    let description: string;
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

        FTAS = await ethers.getContractFactory('FanToArtistStaking');
        fanToArtistStaking = await FTAS.deploy();
        await fanToArtistStaking.deployed();

        cWeb3MusicNativeToken = await ethers.getContractFactory('Web3MusicNativeToken');
        Web3MusicNativeToken = await cWeb3MusicNativeToken.deploy(fanToArtistStaking.address);
        await Web3MusicNativeToken.deployed();

        DAO = await ethers.getContractFactory('Web3MusicNetworkDAO');
        dao = await DAO.deploy(fanToArtistStaking.address, 10e7, 50e7 + 1, 900, true);
        await dao.deployed();

        await fanToArtistStaking.initialize(Web3MusicNativeToken.address, defArtistReward, 10, 86400, 3, 10);

        expect(users.length).equal(5);
        expect(artists.length).equal(5);

        await dao.manageWhitelist(users[0].address, true);
        await dao.manageWhitelist(users[1].address, true);
        await dao.manageWhitelist(users[2].address, true);

        await Promise.allSettled(users.map(user => {
            Web3MusicNativeToken.connect(owner).mint(user.address, amount);
        }));

        await Promise.allSettled(artists.map(artist => {
            fanToArtistStaking.addArtist(artist.address, owner.address);
        }));

        await Promise.allSettled(users.map((user, index) => {
            fanToArtistStaking.connect(user).stake(artists[index].address, amount, 3600);
        }));

        await Web3MusicNativeToken.connect(owner).transferOwnership(dao.address);
        await dao.propose([Web3MusicNativeToken.address], [calldata], "transfer ownership");

        await dao.connect(users[0]).vote([Web3MusicNativeToken.address], [calldata], "transfer ownership", true);
        await dao.connect(users[1]).vote([Web3MusicNativeToken.address], [calldata], "transfer ownership", true);
        await dao.connect(users[2]).vote([Web3MusicNativeToken.address], [calldata], "transfer ownership", true);

        await timeMachine(15);
        await expect(dao.execute([Web3MusicNativeToken.address], [calldata], "transfer ownership")).emit(dao, "ProposalExecuted").withArgs(anyValue, anyValue, true);

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
        await expect(fanToArtistStaking.connect(users[0]).stake(artists[1].address, 0, 3600)).revertedWith("FanToArtistStaking: the amount can not be zero");
        await expect(fanToArtistStaking.connect(users[0]).increaseAmountStaked(artists[0].address, 0)).revertedWith("FanToArtistStaking: the amount can not be zero");
    });

    it('A user cannot add/remove to/from whitelist another user', async () => {
        await expect(dao.connect(users[0]).manageWhitelist(users[1].address, false)).revertedWith("Ownable: caller is not the owner");
        await expect(dao.connect(users[0]).manageWhitelist(otherUser.address, true)).revertedWith("Ownable: caller is not the owner");
    });

    it('A user cannot disable the whitelist', async () => {
        await expect(dao.connect(users[0]).switchWhitelist(false)).revertedWith("Ownable: caller is not the owner");
    });

    it('A user can make proposal also if he is not whitelisted', async () => {
        await expect(dao.connect(users[3]).propose([Web3MusicNativeToken.address], [calldata], description)).emit(dao, "ProposalCreated");
    });

    it('Propose must respect length format', async () => {
        await expect(dao.connect(users[3]).propose([Web3MusicNativeToken.address], [calldata, calldata], description)).revertedWith("DAO: invalid proposal length");
    });

    it('A user whitelisted can vote', async () => {
        await expect(dao.connect(users[0]).vote([Web3MusicNativeToken.address], [calldata], description, true)).emit(dao, "ProposalVoted");
    });

    it('A user not whitelisted cannot vote', async () => {
        await expect(dao.connect(users[3]).vote([Web3MusicNativeToken.address], [calldata], description, true)).revertedWith("DAO: user not whitelisted");
    });

    it('A user cannot vote twice', async () => {
        await expect(dao.connect(users[0]).vote([Web3MusicNativeToken.address], [calldata], description, true)).revertedWith("DAO: already voted");
    });

    it('A proposal can be executed', async () => {
        await expect(dao.connect(users[1]).vote([Web3MusicNativeToken.address], [calldata], description, true)).emit(dao, "ProposalVoted");
        await expect(dao.connect(users[2]).vote([Web3MusicNativeToken.address], [calldata], description, false)).emit(dao, "ProposalVoted");

        await timeMachine(20);
        await expect(dao.connect(owner).execute([Web3MusicNativeToken.address], [calldata], description)).emit(dao, "ProposalExecuted").withArgs(anyValue, anyValue, true);

        expect(await Web3MusicNativeToken.balanceOf(users[3].address)).equal(1000);
    });

    it('Quorum is reached if the number of voters is greater than half of the whitelisted members at the proposal initialization', async() => {
        await expect(dao.connect(users[0]).propose([Web3MusicNativeToken.address], [calldata], description)).emit(dao,"ProposalCreated");
        await expect(dao.connect(users[1]).vote([Web3MusicNativeToken.address], [calldata], description, true)).emit(dao, "ProposalVoted");
        // This can be a problem:
        // await expect(dao.connect(owner).manageWhitelist(users[3].address, true)); 
        // await expect(dao.connect(owner).manageWhitelist(users[4].address, true)); //HERE WE CHANGE THE NUMBER OF EFFECTIVE WHITELIST MEMBER FROM 3 to 5 
        // await expect(dao.connect(users[3]).vote([Web3MusicNativeToken.address], [calldata], description, true)).emit(dao, "ProposalVoted");
        // await expect(dao.connect(users[4]).vote([Web3MusicNativeToken.address], [calldata], description, true)).emit(dao, "ProposalVoted");
        await expect(dao.connect(users[2]).vote([Web3MusicNativeToken.address], [calldata], description, true)).emit(dao, "ProposalVoted");
        await timeMachine(20);
        await expect(dao.execute([Web3MusicNativeToken.address], [calldata], description)).emit(dao, "ProposalExecuted").withArgs(anyValue, anyValue, true);

        // It should be pointed out that if a quorum is calculated on the number of members on the whitelist at the time of the proposal and later
        // many members are added to the whitelist with already accrued voting power, the required number of voters can be reached even if members present
        // at the time of the proposal have not voted. Since it cannot be determined who are the members present in the whitelist at the moment of the proposal.

    });

    it('Propose doesn\'t pass if the amount of negative votes are greater than the amount of the positive votes', async() => {
        await expect(dao.connect(users[0]).propose([Web3MusicNativeToken.address], [calldata], description)).emit(dao,"ProposalCreated");
        await expect(dao.connect(users[0]).vote([Web3MusicNativeToken.address], [calldata], description, true)).emit(dao, "ProposalVoted");
        await expect(dao.connect(users[1]).vote([Web3MusicNativeToken.address], [calldata], description, false)).emit(dao, "ProposalVoted");
        await expect(dao.connect(users[2]).vote([Web3MusicNativeToken.address], [calldata], description, false)).emit(dao, "ProposalVoted");
        await timeMachine(20);
        await expect(dao.execute([Web3MusicNativeToken.address], [calldata], description)).emit(dao, "ProposalExecuted").withArgs(anyValue, anyValue, false);
    });
    
    it('Owner can switch off whitelist', async() => {
        await expect(dao.connect(owner).switchWhitelist(false)).emit(dao,"WhitelistSwitched");
    })
    
    it('Other addresses cannot switch whitelist', async() => {
        await expect(dao.connect(users[0]).switchWhitelist(true)).revertedWith("Ownable: caller is not the owner");
    })

    it('Owner should not be able to add/remove users already added/removed', async() => {
        await expect(dao.connect(owner).manageWhitelist(users[0].address, true)).revertedWith("F2A: already added/removed.");
        await dao.connect(owner).manageWhitelist(users[1].address, false);
        await expect(dao.connect(owner).manageWhitelist(users[1].address, false)).revertedWith("F2A: already added/removed.");
    })

});