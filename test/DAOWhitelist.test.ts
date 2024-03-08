import { expect } from 'chai';
import { ethers, web3, upgrades } from 'hardhat';
import { FanToArtistStaking, Web3MusicNativeToken, Web3MusicNetworkDAO } from '../typechain-types/index';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { timeMachine } from './utils/utils';
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
        fanToArtistStaking = await upgrades.deployProxy(FTAS.connect(owner), [], {initializer: false, kind: 'uups', timeout: 180000}) as unknown as FanToArtistStaking;
        await fanToArtistStaking.deployed();

        cWeb3MusicNativeToken = await ethers.getContractFactory('Web3MusicNativeToken');
        Web3MusicNativeToken = await cWeb3MusicNativeToken.deploy(fanToArtistStaking.address);
        await Web3MusicNativeToken.deployed();

        DAO = await ethers.getContractFactory('Web3MusicNetworkDAO');
        dao = await DAO.deploy(fanToArtistStaking.address, 10e7, 50e7 + 1, 900, true);
        await dao.deployed();

        await fanToArtistStaking.initialize(Web3MusicNativeToken.address, defArtistReward, 10, 86400, 3, 600);

        expect(users.length).equal(5);
        expect(artists.length).equal(5);

        await dao.manageWhitelist(users[0].address, true);
        await dao.manageWhitelist(users[1].address, true);
        await dao.manageWhitelist(users[2].address, true);

        await Promise.allSettled(users.map(user => {
            Web3MusicNativeToken.connect(owner).mint(user.address, amount);
        }));

        await Promise.allSettled(users.map(user => {
              Web3MusicNativeToken.connect(user).approve(fanToArtistStaking.address, amount)
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

    it('A proposal that has not been voted cannot be executed', async () => {
        await expect(dao.connect(users[0]).propose([Web3MusicNativeToken.address], [calldata], description)).emit(dao,"ProposalCreated");

        await timeMachine(20);

        await expect(dao.connect(owner).execute([Web3MusicNativeToken.address], [calldata], description)).emit(dao, "ProposalExecuted").withArgs(anyValue, anyValue, false);
    });

    it('Quorum is reached if the number of voters is greater than half of the whitelisted members at the proposal initialization', async() => {
        await expect(dao.connect(users[0]).propose([Web3MusicNativeToken.address], [calldata], description)).emit(dao,"ProposalCreated");
        await expect(dao.connect(users[1]).vote([Web3MusicNativeToken.address], [calldata], description, true)).emit(dao, "ProposalVoted");
        await expect(dao.connect(users[2]).vote([Web3MusicNativeToken.address], [calldata], description, true)).emit(dao, "ProposalVoted");
        await timeMachine(20);
        await expect(dao.execute([Web3MusicNativeToken.address], [calldata], description)).emit(dao, "ProposalExecuted").withArgs(anyValue, anyValue, true);
    });

    it('Propose doesn\'t pass if the amount of negative votes are greater than the amount of the positive votes', async() => {
        await expect(dao.connect(users[0]).propose([Web3MusicNativeToken.address], [calldata], description)).emit(dao,"ProposalCreated");
        await expect(dao.connect(users[0]).vote([Web3MusicNativeToken.address], [calldata], description, true)).emit(dao, "ProposalVoted");
        await expect(dao.connect(users[1]).vote([Web3MusicNativeToken.address], [calldata], description, false)).emit(dao, "ProposalVoted");
        await expect(dao.connect(users[2]).vote([Web3MusicNativeToken.address], [calldata], description, false)).emit(dao, "ProposalVoted");
        await timeMachine(20);
        await expect(dao.execute([Web3MusicNativeToken.address], [calldata], description)).emit(dao, "ProposalExecuted").withArgs(anyValue, anyValue, false);
    });

    it('Owner should not be able to add/remove users already added/removed', async() => {
        await expect(dao.connect(owner).manageWhitelist(users[0].address, true)).revertedWith("F2A: already added/removed.");
        await dao.connect(owner).manageWhitelist(users[1].address, false);
        await expect(dao.connect(owner).manageWhitelist(users[1].address, false)).revertedWith("F2A: already added/removed.");
    })

    it('Proposals created while the whitelist was empty should not be executed. ', async() => {
        await dao.connect(owner).manageWhitelist(users[0].address, false);
        await dao.connect(owner).manageWhitelist(users[2].address, false);
        //Now whitelist is empty
        await expect(dao.connect(users[3]).propose([Web3MusicNativeToken.address], [calldata], description)).emit(dao,"ProposalCreated");
        await timeMachine(20);
        await expect(dao.execute([Web3MusicNativeToken.address], [calldata], description)).emit(dao, "ProposalExecuted").withArgs(anyValue, anyValue, false);
    })

    it('Proposals created while the whitelist was empty should not be executed even if someone later votes for them.', async() => {
        await expect(dao.connect(users[3]).propose([Web3MusicNativeToken.address], [calldata], description)).emit(dao,"ProposalCreated");
        
        await dao.connect(owner).manageWhitelist(users[0].address, true);
        await expect(dao.connect(users[0]).vote([Web3MusicNativeToken.address], [calldata], description, true)).to.emit(dao, "ProposalVoted");

        await timeMachine(20);
        await expect(dao.execute([Web3MusicNativeToken.address], [calldata], description)).emit(dao, "ProposalExecuted").withArgs(anyValue, anyValue, false);
    })

});
