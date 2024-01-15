import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect, use } from "chai";
import { ContractTransaction } from "@ethersproject/contracts";
import { ethers, web3 } from "hardhat";
import {
  Web3MusicNetworkDAO,
  Web3MusicNativeToken,
  FanToArtistStaking,
} from "../typechain-types/index";
import { timeMachine } from "./utils/utils";
import { BigNumber } from "ethers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe("DAO", () => {
  let dao: Web3MusicNetworkDAO;
  let Web3MusicNativeToken: Web3MusicNativeToken;
  let fanToArtistStaking: FanToArtistStaking;
  let owner: SignerWithAddress;
  let artists: SignerWithAddress[]; //6
  let users: SignerWithAddress[]; //13
  const defArtistReward = 10;
  const minStakeTime = 10;
  const maxStakeTime = 864000;

  before(async () => {
    const signers = await ethers.getSigners();
    owner = signers[0];
    artists = signers.slice(1, 7);
    users = signers.slice(7, 20);

    const FTAS = await ethers.getContractFactory("FanToArtistStaking");
    fanToArtistStaking = await FTAS.deploy();
    await fanToArtistStaking.deployed();

    const cWeb3MusicNativeToken = await ethers.getContractFactory(
      "Web3MusicNativeToken"
    );
    Web3MusicNativeToken = await cWeb3MusicNativeToken.deploy(
      fanToArtistStaking.address
    );
    await Web3MusicNativeToken.deployed();
    await fanToArtistStaking.initialize(
      Web3MusicNativeToken.address,
      defArtistReward,
      minStakeTime,
      maxStakeTime,
      3,
      10
    );

    const cDAO = await ethers.getContractFactory("Web3MusicNetworkDAO");
    dao = (await cDAO.deploy(
      fanToArtistStaking.address,
      10e7,
      50e7 + 1,
      900,
      false
    )) as Web3MusicNetworkDAO;
    await dao.deployed();

    await Promise.allSettled(
      artists.map((artist) =>
        fanToArtistStaking.addArtist(artist.address, owner.address)
      )
    );
    await Promise.allSettled(
      users.map((user) =>
        Web3MusicNativeToken.mint(
          user.address,
          BigNumber.from(10).pow(19).mul(10)
        )
      )
    );
    const promises: Promise<ContractTransaction>[] = [];
    artists.forEach((artist) =>
      users.forEach((user) =>
        promises.push(
          fanToArtistStaking
            .connect(user)
            .stake(artist.address, BigNumber.from(10).pow(19), 300)
        )
      )
    );
    await Promise.all(promises);
    await timeMachine(6);
    await Web3MusicNativeToken.connect(owner).transferOwnership(dao.address); //give ownership of Web3MusicNativeToken to dao
    const calldata = web3.eth.abi.encodeFunctionCall(
      {
        name: "acceptOwnership",
        type: "function",
        inputs: [],
      },
      []
    );
    await dao.propose(
      [Web3MusicNativeToken.address],
      [calldata],
      "transfer ownership"
    ); //give ownership of Web3MusicNativeToken to dao
    await Promise.all(
      users.map((u) =>
        dao
          .connect(u)
          .vote(
            [Web3MusicNativeToken.address],
            [calldata],
            "transfer ownership",
            true
          )
      )
    );
    await timeMachine(15);
    await dao.execute(
      [Web3MusicNativeToken.address],
      [calldata],
      "transfer ownership"
    );
  });

  describe("vote testing", () => {
    let calldata: string;
    let hash: BigNumber;
    before(() => {
      calldata = web3.eth.abi.encodeFunctionCall(
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
        [owner.address, `1000`]
      );
    });

    it("Creation of a proposal", async () => {
      const receipt = await dao
        .connect(users[2])
        .propose(
          [Web3MusicNativeToken.address],
          [calldata],
          "Gift previous owner"
        );
      const propCreated = (await receipt.wait()).events
        ?.filter((e) => e.event == "ProposalCreated")
        .at(0)?.args!;
      hash = propCreated.proposalId;
      expect(propCreated.proposer).to.deep.equal(users[2].address);
      expect(propCreated.targets).to.deep.equal([Web3MusicNativeToken.address]);
      expect(propCreated.calldatas).to.deep.equal([calldata]);
      expect(propCreated.description).to.deep.equal("Gift previous owner");

      //Other users should not be able to create the same proposal if one is already active
      await expect(
        dao
          .connect(users[2])
          .propose(
            [Web3MusicNativeToken.address],
            [calldata],
            "Gift previous owner"
          )
      ).to.be.revertedWith("DAO: proposal already exists");
    });

    it("Voting a proposal", async () => {
      await Promise.all(
        users.map((u) =>
          dao
            .connect(u)
            .vote(
              [Web3MusicNativeToken.address],
              [calldata],
              "Gift previous owner",
              true
            )
        )
      );
      await expect(
        dao
          .connect(users[1])
          .vote(
            [Web3MusicNativeToken.address],
            [calldata],
            "Gift previous owner",
            true
          )
      ).to.revertedWith("DAO: already voted");
      const prevWeb3MusicNativeToken = await Web3MusicNativeToken.balanceOf(
        owner.address
      );
      await timeMachine(15);
      await dao.execute(
        [Web3MusicNativeToken.address],
        [calldata],
        "Gift previous owner"
      );
      expect(Number(prevWeb3MusicNativeToken) + 1000).to.equal(
        await Web3MusicNativeToken.balanceOf(owner.address)
      );
    });
    it("Propose again an already executed one", async () => {
      await dao
        .connect(users[2])
        .propose(
          [Web3MusicNativeToken.address],
          [calldata],
          "Gift previous owner"
        );
      const proposal = await dao.getProposal(
        [Web3MusicNativeToken.address],
        [calldata],
        "Gift previous owner"
      );
      expect(proposal.votesFor).to.equal(0);
      expect(proposal.votesAgainst).to.equal(0);
      expect(proposal.votesAgainst).to.equal(0);
    });
    it("Should not execute a vote if does not pass", async () => {
      const yesUser = users.slice(0, 6);
      const noUser = users.slice(-7);
      await Promise.all(
        yesUser.map((u) =>
          dao
            .connect(u)
            .vote(
              [Web3MusicNativeToken.address],
              [calldata],
              "Gift previous owner",
              true
            )
        )
      );
      await Promise.all(
        noUser.map((u) =>
          dao
            .connect(u)
            .vote(
              [Web3MusicNativeToken.address],
              [calldata],
              "Gift previous owner",
              false
            )
        )
      );
      await timeMachine(15);
      const prop = await dao.getProposal(
        [Web3MusicNativeToken.address],
        [calldata],
        "Gift previous owner"
      );
      expect(prop.votesFor).to.be.lessThan(prop.votesAgainst);
      const prevWeb3MusicNativeToken = await Web3MusicNativeToken.balanceOf(
        owner.address
      );
      await dao.execute(
        [Web3MusicNativeToken.address],
        [calldata],
        "Gift previous owner"
      );
      expect(await Web3MusicNativeToken.balanceOf(owner.address)).to.be.equal(
        prevWeb3MusicNativeToken
      );
    });

    it("Should not be able to get a fake proposal ID", async () => {
      await expect(dao.getProposal([Web3MusicNativeToken.address], [calldata], "non-existent proposal")).revertedWith("DAO: proposal not found")
    })

    it("User should not be able to vote a fake proposal", async () => {
      await expect(dao.connect(users[0]).vote([Web3MusicNativeToken.address], [calldata], "non-existent proposal", true)).revertedWith("DAO: proposal not found")
    })

    it("Owner should not be able to execute a fake proposal", async () => {
      await expect(dao.connect(owner).execute([Web3MusicNativeToken.address], [calldata], "non-existent proposal")).revertedWith("DAO: proposal not found")
    })

    it("Creation of same proposal with no votes", async () => {
      await dao
        .connect(users[2])
        .propose(
          [Web3MusicNativeToken.address],
          [calldata],
          "Test not revert1"
        );

      await timeMachine(20);
      //Other users should not be able to create the same proposal if one is already active
      await expect(
        dao
          .connect(users[2])
          .propose(
            [Web3MusicNativeToken.address],
            [calldata],
            "Test not revert1"
          )
      ).to.not.be.revertedWith("DAO: proposal already exists");
    });

    it("Creation of same proposal when doesnt pass", async () => {
      await dao
        .connect(users[2])
        .propose(
          [Web3MusicNativeToken.address],
          [calldata],
          "Test not revert2"
        );
      const yesUser = users.slice(0, 6);
      const noUser = users.slice(-7);
      await Promise.all(
        yesUser.map((u) =>
          dao
            .connect(u)
            .vote(
              [Web3MusicNativeToken.address],
              [calldata],
              "Test not revert2",
              true
            )
        )
      );
      await Promise.all(
        noUser.map((u) =>
          dao
            .connect(u)
            .vote(
              [Web3MusicNativeToken.address],
              [calldata],
              "Test not revert2",
              false
            )
        )
      );
      await timeMachine(15);
      //Other users should not be able to create the same proposal if one is already active
      await expect(
        dao
          .connect(users[2])
          .propose(
            [Web3MusicNativeToken.address],
            [calldata],
            "Test not revert2"
          )
      ).to.not.be.revertedWith("DAO: proposal already exists");

      await expect(
        dao
          .connect(yesUser[0])
          .vote(
            [Web3MusicNativeToken.address],
            [calldata],
            "Test not revert2",
            true
          )
      ).to.not.be.revertedWith("DAO: already voted");
    });

    it("Creation of same proposal when passes", async () => {
      await dao
        .connect(users[2])
        .propose(
          [Web3MusicNativeToken.address],
          [calldata],
          "Test not revert3"
        );
      const noUser = users.slice(0, 6);
      const yesUser = users.slice(-7);
      await Promise.all(
        noUser.map((u) =>
          dao
            .connect(u)
            .vote(
              [Web3MusicNativeToken.address],
              [calldata],
              "Test not revert3",
              false
            )
        )
      );
      await Promise.all(
        yesUser.map((u) =>
          dao
            .connect(u)
            .vote(
              [Web3MusicNativeToken.address],
              [calldata],
              "Test not revert3",
              true
            )
        )
      );
      await timeMachine(15);
      //Other users should not be able to create the same proposal if one is already active
      await expect(
        dao
          .connect(users[2])
          .propose(
            [Web3MusicNativeToken.address],
            [calldata],
            "Test not revert3"
          )
      ).to.be.revertedWith("DAO: proposal already exists");
    });

    it("Should not be able to vote a ended stake", async () => {
      await expect(dao.connect(users[1]).propose([Web3MusicNativeToken.address], [calldata], "Test propose ended")).to.emit(dao, "ProposalCreated");
      await dao.connect(users[1]).vote([Web3MusicNativeToken.address], [calldata], "Test propose ended", true);
      await dao.connect(users[2]).vote([Web3MusicNativeToken.address], [calldata], "Test propose ended", true);
      await timeMachine(16);
      await expect(dao.connect(users[1]).vote([Web3MusicNativeToken.address], [calldata], "Test propose ended", true)).to.revertedWith("DAO: proposal expired");
      await expect(dao.connect(owner).execute([Web3MusicNativeToken.address], [calldata], "Test propose ended"))
        .to.emit(dao, "ProposalExecuted").withArgs(anyValue, anyValue, true);
    });
    it("Should not be able to execute a not-ended stake", async () => {
      await expect(dao.connect(users[1]).propose([Web3MusicNativeToken.address], [calldata], "Test propose ended")).to.emit(dao,"ProposalCreated");
      await timeMachine(10);
      await expect(dao.connect(owner).execute([Web3MusicNativeToken.address], [calldata], "Test propose ended")).to.revertedWith("DAO: proposal not ended");
    });

  });
});
