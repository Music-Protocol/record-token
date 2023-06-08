import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ContractTransaction } from '@ethersproject/contracts';
import { ethers, web3 } from 'hardhat';
import { PublicPressureDAO, JTP, FanToArtistStaking } from '../typechain-types/index';
import { timeMachine } from './utils/utils';
import { BigNumber } from 'ethers';

describe('DAO', () => {
    let dao: PublicPressureDAO;
    let jtp: JTP;
    let fanToArtistStaking: FanToArtistStaking;
    let owner: SignerWithAddress;
    let artists: SignerWithAddress[]; //6
    let users: SignerWithAddress[]; //13    
    const defVeReward = 10;
    const defArtistReward = 10;
    const minStakeTime = 10;
    const maxStakeTime = 864000;


    before(async () => {
        const signers = await ethers.getSigners();
        owner = signers[0];
        artists = signers.slice(1, 7);
        users = signers.slice(7, 20);

        const FTAS = await ethers.getContractFactory('FanToArtistStaking');
        fanToArtistStaking = await FTAS.deploy();
        await fanToArtistStaking.deployed();

        const cJTP = await ethers.getContractFactory('JTP');
        jtp = await cJTP.deploy(fanToArtistStaking.address, fanToArtistStaking.address);
        await jtp.deployed();
        await fanToArtistStaking.initialize(jtp.address, owner.address, defVeReward, defArtistReward, minStakeTime, maxStakeTime);

        const cDAO = await ethers.getContractFactory('PublicPressureDAO');
        dao = await cDAO.deploy(fanToArtistStaking.address, 10e7, 50e7 + 1, 900) as PublicPressureDAO;
        await dao.deployed();

        await Promise.allSettled(artists.map(artist =>
            fanToArtistStaking.addArtist(artist.address, owner.address)
        ));
        await Promise.allSettled(users.map(user =>
            jtp.mint(user.address, 100)
        ));
        const promises: Promise<ContractTransaction>[] = [];
        artists.forEach(artist =>
            users.forEach(user =>
                promises.push(fanToArtistStaking.connect(user).stake(artist.address, 10, 300)))
        );
        await fanToArtistStaking.connect(owner).setVotingPowerOf(users.map(u => u.address), users.map(u => 1000));
        await fanToArtistStaking.connect(owner).setTotalVotingPower(users.length*1000);
        await Promise.all(promises);
        await timeMachine(6);
        await jtp.connect(owner).transferOwnership(dao.address);//give ownership of jtp to dao
    });

    describe('vote testing', () => {
        let calldata: string;
        let hash: BigNumber;
        before(() => {
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
            }, [owner.address, `1000`]);
        })


        it('Creation of a proposal', async () => {
            const receipt = await dao.connect(users[2]).propose([jtp.address], [calldata], "Gift previous owner");
            const propCreated = (await receipt.wait()).events?.filter(e => e.event == 'ProposalCreated').at(0)?.args!;
            hash = propCreated.proposalId;
            expect(propCreated.proposer).to.deep.equal(users[2].address);
            expect(propCreated.targets).to.deep.equal([jtp.address]);
            expect(propCreated.calldatas).to.deep.equal([calldata]);
            expect(propCreated.description).to.deep.equal("Gift previous owner");

            //Other users should not be able to create the same proposal if one is already active
            await expect(dao.connect(users[2]).propose([jtp.address], [calldata], "Gift previous owner"))
                .to.be.revertedWith("DAO: proposal already exists");
        });

        it('Voting a proposal', async () => {
            await Promise.all(users.map(u =>
                dao.connect(u).vote([jtp.address], [calldata], "Gift previous owner", true))
            )
            await expect(dao.connect(users[1]).vote([jtp.address], [calldata], "Gift previous owner", true))
                .to.revertedWith('DAO: already voted');
            const prevJTP = await jtp.balanceOf(owner.address);
            await timeMachine(15);
            await dao.execute([jtp.address], [calldata], "Gift previous owner");
            expect(Number(prevJTP) + 1000).to.equal(await jtp.balanceOf(owner.address));
        });
        it('Propose again an already executed one', async () => {
            await dao.connect(users[2]).propose([jtp.address], [calldata], "Gift previous owner");
            const proposal = await dao.getProposal([jtp.address], [calldata], "Gift previous owner");
            expect(proposal.votesFor).to.equal(0);
            expect(proposal.votesAgainst).to.equal(0);
            expect(proposal.votesAgainst).to.equal(0);
        });
        it('Should not execute a vote if does not pass', async () => {
            const yesUser = users.slice(0, 6);
            const noUser = users.slice(- 7);
            await Promise.all(yesUser.map(u =>
                dao.connect(u).vote([jtp.address], [calldata], "Gift previous owner", true))
            )
            await Promise.all(noUser.map(u =>
                dao.connect(u).vote([jtp.address], [calldata], "Gift previous owner", false))
            )
            await timeMachine(15);
            const prop = await dao.getProposal([jtp.address], [calldata], "Gift previous owner");
            expect(prop.votesFor).to.be.lessThan(prop.votesAgainst);
            const prevJTP = await jtp.balanceOf(owner.address);
            await dao.execute([jtp.address], [calldata], "Gift previous owner");
            expect(await jtp.balanceOf(owner.address)).to.be.equal(prevJTP);
        });

        it('Creation of same proposal with no votes', async () => {
            await dao.connect(users[2]).propose([jtp.address], [calldata], "Test not revert1");

            await timeMachine(20);
            //Other users should not be able to create the same proposal if one is already active
            await expect(dao.connect(users[2]).propose([jtp.address], [calldata], "Test not revert1"))
                .to.not.be.revertedWith("DAO: proposal already exists");
        });

        it('Creation of same proposal when doesnt pass', async () => {
            await dao.connect(users[2]).propose([jtp.address], [calldata], "Test not revert2");
            const yesUser = users.slice(0, 6);
            const noUser = users.slice(- 7);
            await Promise.all(yesUser.map(u =>
                dao.connect(u).vote([jtp.address], [calldata], "Test not revert2", true))
            )
            await Promise.all(noUser.map(u =>
                dao.connect(u).vote([jtp.address], [calldata], "Test not revert2", false))
            )
            await timeMachine(15);
            //Other users should not be able to create the same proposal if one is already active
            await expect(dao.connect(users[2]).propose([jtp.address], [calldata], "Test not revert2"))
                .to.not.be.revertedWith("DAO: proposal already exists");


            await expect(dao.connect(yesUser[0]).vote([jtp.address], [calldata], "Test not revert2", true))
                .to.not.be.revertedWith("DAO: already voted");

        });

        it('Creation of same proposal when passes', async () => {
            await dao.connect(users[2]).propose([jtp.address], [calldata], "Test not revert3");
            const noUser = users.slice(0, 6);
            const yesUser = users.slice(- 7);
            await Promise.all(noUser.map(u =>
                dao.connect(u).vote([jtp.address], [calldata], "Test not revert3", false))
            )
            await Promise.all(yesUser.map(u =>
                dao.connect(u).vote([jtp.address], [calldata], "Test not revert3", true))
            )
            await timeMachine(15);
            //Other users should not be able to create the same proposal if one is already active
            await expect(dao.connect(users[2]).propose([jtp.address], [calldata], "Test not revert3"))
                .to.be.revertedWith("DAO: proposal already exists");
        });
    });
});