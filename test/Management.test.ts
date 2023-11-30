import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BytesLike } from "ethers";
import { ethers, web3 } from "hardhat";
import {
  FanToArtistStaking,
  Web3MusicNativeToken,
  Web3MusicNativeTokenManagement,
} from "../typechain-types/index";

describe("Web3MusicNativeTokenManagement", () => {
  let Web3MusicNativeToken: Web3MusicNativeToken;
  let Web3MusicNativeTokenManagement: Web3MusicNativeTokenManagement;
  let fanToArtistStaking: FanToArtistStaking;
  let owner: SignerWithAddress,
    addr1: SignerWithAddress,
    addr2: SignerWithAddress,
    fakeDAO: SignerWithAddress;
  let artist1: SignerWithAddress, artist2: SignerWithAddress;
  let adminRole: BytesLike,
    minterRole: BytesLike,
    burnerRole: BytesLike,
    verifyArtistRole: BytesLike,
    removeArtistRole: BytesLike;
  const calldata = web3.eth.abi.encodeFunctionCall(
    {
      name: "acceptOwnership",
      type: "function",
      inputs: [],
    },
    []
  );

  before(async () => {
    //same as deploy
    [owner, addr1, addr2, fakeDAO, artist1, artist2] =
      await ethers.getSigners();

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
    fanToArtistStaking.initialize(
      Web3MusicNativeToken.address,
      10,
      10,
      60,
      86400,
      3,
      10
    );

    const cWeb3MusicNativeTokenManagement = await ethers.getContractFactory(
      "Web3MusicNativeTokenManagement"
    );
    Web3MusicNativeTokenManagement =
      await cWeb3MusicNativeTokenManagement.deploy(
        Web3MusicNativeToken.address,
        fanToArtistStaking.address
      );
    await Web3MusicNativeTokenManagement.deployed();
    await Web3MusicNativeToken.transferOwnership(
      Web3MusicNativeTokenManagement.address
    );

    await Web3MusicNativeTokenManagement.custom(
      [Web3MusicNativeToken.address],
      [calldata]
    );
    await fanToArtistStaking.transferOwnership(
      Web3MusicNativeTokenManagement.address
    );
    await Web3MusicNativeTokenManagement.custom(
      [fanToArtistStaking.address],
      [calldata]
    );
    // await Web3MusicNativeTokenManagement.custom([calldata]);

    adminRole = await Web3MusicNativeTokenManagement.DEFAULT_ADMIN_ROLE();
    minterRole = await Web3MusicNativeTokenManagement.MINTER_ROLE();
    burnerRole = await Web3MusicNativeTokenManagement.BURNER_ROLE();
    verifyArtistRole =
      await Web3MusicNativeTokenManagement.VERIFY_ARTIST_ROLE();
    removeArtistRole =
      await Web3MusicNativeTokenManagement.REMOVE_ARTIST_ROLE();
  });

  describe("Deployment", () => {
    it("The owner of Web3MusicNativeToken should be the Web3MusicNativeTokenManagement contract", async () => {
      expect(await Web3MusicNativeToken.owner()).to.equal(
        Web3MusicNativeTokenManagement.address
      );
    });

    it("The owner of FanToArtistStaking should be the Web3MusicNativeTokenManagement contract", async () => {
      expect(await fanToArtistStaking.owner()).to.equal(
        Web3MusicNativeTokenManagement.address
      );
    });

    it("The deployer of the contract should have all the roles", async () => {
      expect(
        await Web3MusicNativeTokenManagement.hasRole(adminRole, owner.address)
      ).to.be.true;
      expect(
        await Web3MusicNativeTokenManagement.hasRole(minterRole, owner.address)
      ).to.be.true;
      expect(
        await Web3MusicNativeTokenManagement.hasRole(burnerRole, owner.address)
      ).to.be.true;
      expect(
        await Web3MusicNativeTokenManagement.hasRole(
          verifyArtistRole,
          owner.address
        )
      ).to.be.true;
    });
    it("Another user should have no role", async () => {
      expect(
        await Web3MusicNativeTokenManagement.hasRole(adminRole, addr1.address)
      ).to.be.false;
      expect(
        await Web3MusicNativeTokenManagement.hasRole(minterRole, addr1.address)
      ).to.be.false;
      expect(
        await Web3MusicNativeTokenManagement.hasRole(burnerRole, addr1.address)
      ).to.be.false;
      expect(
        await Web3MusicNativeTokenManagement.hasRole(
          verifyArtistRole,
          addr1.address
        )
      ).to.be.false;
    });
  });

  describe("Web3MusicNativeToken", () => {
    it("The deployer of Web3MusicNativeToken should not be able to call a onlyOwner method", async () => {
      await expect(
        Web3MusicNativeToken.connect(owner).mint(addr1.address, 10)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    describe("Pausable", () => {
      it("An address without the DEFAULT_ADMIN_ROLE should not be able to pause Web3MusicNativeToken", async () => {
        await expect(
          Web3MusicNativeTokenManagement.connect(
            addr1
          ).pauseWeb3MusicNativeToken()
        ).to.be.revertedWith(
          `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${adminRole}`
        );
      });

      it("An address with the DEFAULT_ADMIN_ROLE should be able to pause Web3MusicNativeToken", async () => {
        await Web3MusicNativeTokenManagement.connect(
          owner
        ).pauseWeb3MusicNativeToken();
        expect(await Web3MusicNativeToken.paused()).to.equal(true);
      });

      it("An address without the DEFAULT_ADMIN_ROLE should not be able to unpause Web3MusicNativeToken", async () => {
        await expect(
          Web3MusicNativeTokenManagement.connect(
            addr1
          ).unpauseWeb3MusicNativeToken()
        ).to.be.revertedWith(
          `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${adminRole}`
        );
      });

      it("An address with the DEFAULT_ADMIN_ROLE should be able to unpause Web3MusicNativeToken", async () => {
        await Web3MusicNativeTokenManagement.connect(
          owner
        ).unpauseWeb3MusicNativeToken();
        expect(await Web3MusicNativeToken.paused()).to.equal(false);
      });
    });

    describe("Minting", () => {
      it("An address with the MINTER_ROLE should be able to mint Web3MusicNativeToken", async () => {
        await Web3MusicNativeTokenManagement.connect(owner).mint(
          addr1.address,
          10
        );
        expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(
          10
        );
      });

      it("An address without the MINTER_ROLE should not be able to mint Web3MusicNativeToken", async () => {
        await expect(
          Web3MusicNativeTokenManagement.connect(addr1).mint(addr1.address, 10)
        ).to.be.revertedWith(
          `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${minterRole}`
        );
      });
    });

    describe("Burning", () => {
      before(async () => {
        await Web3MusicNativeTokenManagement.connect(owner).mint(
          Web3MusicNativeTokenManagement.address,
          10
        );
      });

      it("An address without the BURNERN_ROLE should not be able to burn Web3MusicNativeToken", async () => {
        await expect(
          Web3MusicNativeTokenManagement.connect(addr1).burn(10)
        ).to.be.revertedWith(
          `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${burnerRole}`
        );
      });

      it("An address with the BURNERN_ROLE should be able to burn Web3MusicNativeToken", async () => {
        await Web3MusicNativeTokenManagement.grantRole(
          burnerRole,
          addr1.address
        );
        await Web3MusicNativeTokenManagement.connect(addr1).burn(10);
        expect(await Web3MusicNativeToken.balanceOf(owner.address)).to.equal(0);
      });
    });

    describe("Burning From", () => {
      before(async () => {
        await Web3MusicNativeTokenManagement.connect(owner).mint(
          addr2.address,
          10
        );
        await Web3MusicNativeToken.connect(addr2).approve(
          Web3MusicNativeTokenManagement.address,
          10
        );
        await Web3MusicNativeTokenManagement.revokeRole(
          burnerRole,
          addr1.address
        );
      });

      it("An address without the BURNERN_ROLE should not be able to burn Web3MusicNativeToken", async () => {
        await expect(
          Web3MusicNativeTokenManagement.connect(addr1).burnFrom(
            addr2.address,
            10
          )
        ).to.be.revertedWith(
          `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${burnerRole}`
        );
      });

      it("An address with the BURNERN_ROLE should be able to burn Web3MusicNativeToken", async () => {
        await Web3MusicNativeTokenManagement.grantRole(
          burnerRole,
          addr1.address
        );
        await Web3MusicNativeTokenManagement.connect(addr1).burnFrom(
          addr2.address,
          10
        );
        expect(await Web3MusicNativeToken.balanceOf(owner.address)).to.equal(0);
      });
    });

    describe("Transfer Ownership", () => {
      it("An address without the DEFAULT_ADMIN_ROLE should not be able to transfer the ownership of Web3MusicNativeToken contract", async () => {
        await expect(
          Web3MusicNativeTokenManagement.connect(
            addr1
          ).transferWeb3MusicNativeToken(fakeDAO.address)
        ).to.be.revertedWith(
          `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${adminRole}`
        );
      });

      it("An address with the DEFAULT_ADMIN_ROLE should be able to transfer the ownership of Web3MusicNativeToken contract", async () => {
        await Web3MusicNativeTokenManagement.connect(
          owner
        ).transferWeb3MusicNativeToken(fakeDAO.address);
        await Web3MusicNativeToken.connect(fakeDAO).acceptOwnership();
        expect(await Web3MusicNativeToken.owner()).to.equal(fakeDAO.address);
      });

      after(async () => {
        await Web3MusicNativeToken.connect(fakeDAO).transferOwnership(
          Web3MusicNativeTokenManagement.address
        );
        await Web3MusicNativeTokenManagement.custom(
          [Web3MusicNativeToken.address],
          [calldata]
        );
      });
      // This test work but is redundant, already tested on Web3MusicNativeToken.js -> Access Control
      // it('An address with the correct role should not be able to perfom ', async()=>{
      //     await expect(Web3MusicNativeTokenManagement.connect(owner).mint(Web3MusicNativeTokenManagement.address, 10)).to.be.revertedWith(`Ownable: caller is not the owner`);
      // });
    });
  });

  describe("FanToArtistStaking", () => {
    describe("Verified Artist", () => {
      before(async () => {
        await Web3MusicNativeTokenManagement.grantRole(
          verifyArtistRole,
          addr1.address
        );
        await Web3MusicNativeTokenManagement.grantRole(
          removeArtistRole,
          addr1.address
        );
      });

      it("When an artist is added through ftas should emit an event", async () => {
        await expect(
          Web3MusicNativeTokenManagement.connect(addr1).addArtist(
            [artist1.address]
          )
        ).to.emit(fanToArtistStaking, "ArtistAdded"); //emit event correct
      });

      it("When an artist is removed through ftas should emit an event", async () => {
        await expect(
          Web3MusicNativeTokenManagement.connect(addr1).removeArtist(
            [artist1.address]
          )
        ).to.emit(fanToArtistStaking, "ArtistRemoved"); //emit event correct
      });

      it("Artists can be added by group", async () => {
        await Web3MusicNativeTokenManagement.connect(addr1).addArtist([artist1.address, artist2.address]);
        expect(await fanToArtistStaking.isVerified(artist1.address)).to.be.true;
        expect(await fanToArtistStaking.isVerified(artist2.address)).to.be.true;
      });

      it("Artists can be removed by group", async () => {
        await Web3MusicNativeTokenManagement.connect(addr1).removeArtist([artist1.address, artist2.address]);
        expect(await fanToArtistStaking.isVerified(artist1.address)).to.be.false;
        expect(await fanToArtistStaking.isVerified(artist2.address)).to.be.false;
      });
      
      it("Should revert", async () => {
        await expect(
          Web3MusicNativeTokenManagement.connect(artist1).addArtist(
            [artist1.address]
          )
        ).to.be.revertedWith(
          `AccessControl: account ${artist1.address.toLowerCase()} is missing role ${verifyArtistRole}`
        );
        await expect(
          Web3MusicNativeTokenManagement.connect(artist1).removeArtist(
            [artist1.address]
          )
        ).to.be.revertedWith(
          `AccessControl: account ${artist1.address.toLowerCase()} is missing role ${removeArtistRole}`
        );
      });
    });

    describe("Transfer Ownership", () => {
      it("An address without the DEFAULT_ADMIN_ROLE should not be able to transfer the ownership of FTAS contract", async () => {
        await expect(
          Web3MusicNativeTokenManagement.connect(
            addr1
          ).transferFanToArtistStaking(fakeDAO.address)
        ).to.be.revertedWith(
          `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${adminRole}`
        );
      });

      it("An address with the DEFAULT_ADMIN_ROLE should be able to transfer the ownership of FTAS contract", async () => {
        await Web3MusicNativeTokenManagement.connect(
          owner
        ).transferFanToArtistStaking(fakeDAO.address);
        await fanToArtistStaking.connect(fakeDAO).acceptOwnership();
        expect(await fanToArtistStaking.owner()).to.equal(fakeDAO.address);
      });

      after(async () => {
        await fanToArtistStaking
          .connect(fakeDAO)
          .transferOwnership(Web3MusicNativeTokenManagement.address);
        await Web3MusicNativeTokenManagement.custom(
          [fanToArtistStaking.address],
          [calldata]
        );
      });
    });
  });

  describe("Event emitting", () => {
    it("The minting should emit a Mint event", async () => {
      await expect(
        Web3MusicNativeTokenManagement.connect(owner).mint(addr1.address, 100)
      )
        .to.emit(Web3MusicNativeTokenManagement, "Mint")
        .withArgs(addr1.address, 100, owner.address);
    });

    it("The burning should emit a Burn event", async () => {
      await Web3MusicNativeToken.connect(addr1).approve(
        Web3MusicNativeTokenManagement.address,
        100
      );
      await expect(
        Web3MusicNativeTokenManagement.connect(owner).burnFrom(
          addr1.address,
          100
        )
      )
        .to.emit(Web3MusicNativeTokenManagement, "Burn")
        .withArgs(addr1.address, 100, owner.address);
    });
  });
});
