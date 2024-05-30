import { expect } from 'chai';
import { BytesLike } from 'ethers';
import { ethers, web3, upgrades } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ArtistStaking, MusicProtocolRECORDToken, MusicProtocolRECORDTokenManagement } from '../typechain-types/index';

describe('MusicProtocolRECORDTokenManagement', () => {
  let MusicProtocolRECORDToken: MusicProtocolRECORDToken;
  let MusicProtocolRECORDTokenManagement: MusicProtocolRECORDTokenManagement;
  let ArtistStaking: ArtistStaking;
  let owner: SignerWithAddress, addr1: SignerWithAddress, addr2: SignerWithAddress, fakeStaking: SignerWithAddress, fakeDAO: SignerWithAddress;
  let artist1: SignerWithAddress, artist2: SignerWithAddress;
  let adminRole: BytesLike, minterRole: BytesLike, tgeRole: BytesLike, burnerRole: BytesLike, verifyArtistRole: BytesLike, removeArtistRole: BytesLike;
  const calldata = web3.eth.abi.encodeFunctionCall({
    name: 'acceptOwnership',
    type: 'function',
    inputs: []
  }, []);

  before(async () => { //same as deploy
    [owner, addr1, addr2, fakeStaking, fakeDAO, artist1, artist2] = await ethers.getSigners();


    const FTAS = await ethers.getContractFactory('ArtistStaking');
    ArtistStaking = await upgrades.deployProxy(FTAS.connect(owner), [], { initializer: false, kind: 'uups', timeout: 180000 }) as unknown as ArtistStaking;

    const cMusicProtocolRECORDToken = await ethers.getContractFactory('MusicProtocolRECORDToken');
    MusicProtocolRECORDToken = await cMusicProtocolRECORDToken.deploy(ArtistStaking.address);
    await MusicProtocolRECORDToken.deployed();
    ArtistStaking.initialize(MusicProtocolRECORDToken.address, 10, 10, 86400, 3, 600);

    const cMusicProtocolRECORDTokenManagement = await ethers.getContractFactory('MusicProtocolRECORDTokenManagement');
    MusicProtocolRECORDTokenManagement = await cMusicProtocolRECORDTokenManagement.deploy(MusicProtocolRECORDToken.address, ArtistStaking.address);
    await MusicProtocolRECORDTokenManagement.deployed();
    await MusicProtocolRECORDToken.transferOwnership(MusicProtocolRECORDTokenManagement.address);

    await MusicProtocolRECORDTokenManagement.custom([MusicProtocolRECORDToken.address], [calldata]);
    await ArtistStaking.transferOwnership(MusicProtocolRECORDTokenManagement.address);
    await MusicProtocolRECORDTokenManagement.custom([ArtistStaking.address], [calldata]);
    // await MusicProtocolRECORDTokenManagement.custom([calldata]);


    adminRole = await MusicProtocolRECORDTokenManagement.DEFAULT_ADMIN_ROLE();
    minterRole = await MusicProtocolRECORDTokenManagement.MINTER_ROLE();
    tgeRole = await MusicProtocolRECORDTokenManagement.TGE_ROLE();
    burnerRole = await MusicProtocolRECORDTokenManagement.BURNER_ROLE();
    verifyArtistRole = await MusicProtocolRECORDTokenManagement.VERIFY_ARTIST_ROLE();
    removeArtistRole = await MusicProtocolRECORDTokenManagement.REMOVE_ARTIST_ROLE();
  });

  describe('Deployment', () => {
    it('The owner of MusicProtocolRECORDToken should be the MusicProtocolRECORDTokenManagement contract', async () => {
      expect(await MusicProtocolRECORDToken.owner()).to.equal(MusicProtocolRECORDTokenManagement.address);
    });

    it('The owner of ArtistStaking should be the MusicProtocolRECORDTokenManagement contract', async () => {
      expect(await ArtistStaking.owner()).to.equal(MusicProtocolRECORDTokenManagement.address);
    });

    it('The deployer of the contract should have all the roles', async () => {
      expect(await MusicProtocolRECORDTokenManagement.hasRole(adminRole, owner.address)).to.be.true;
      expect(await MusicProtocolRECORDTokenManagement.hasRole(minterRole, owner.address)).to.be.true;
      expect(await MusicProtocolRECORDTokenManagement.hasRole(tgeRole, owner.address)).to.be.true;
      expect(await MusicProtocolRECORDTokenManagement.hasRole(burnerRole, owner.address)).to.be.true;
      expect(await MusicProtocolRECORDTokenManagement.hasRole(verifyArtistRole, owner.address)).to.be.true;
    });
    it('Another user should have no role', async () => {
      expect(await MusicProtocolRECORDTokenManagement.hasRole(adminRole, addr1.address)).to.be.false;
      expect(await MusicProtocolRECORDTokenManagement.hasRole(minterRole, addr1.address)).to.be.false;
      expect(await MusicProtocolRECORDTokenManagement.hasRole(tgeRole, owner.address)).to.be.true;
      expect(await MusicProtocolRECORDTokenManagement.hasRole(burnerRole, addr1.address)).to.be.false;
      expect(await MusicProtocolRECORDTokenManagement.hasRole(verifyArtistRole, addr1.address)).to.be.false;
    });
  });

  it("The deployer of the contract should have all the roles", async () => {
    expect(
      await MusicProtocolRECORDTokenManagement.hasRole(adminRole, owner.address)
    ).to.be.true;
    expect(
      await MusicProtocolRECORDTokenManagement.hasRole(minterRole, owner.address)
    ).to.be.true;
    expect(
      await MusicProtocolRECORDTokenManagement.hasRole(burnerRole, owner.address)
    ).to.be.true;
    expect(
      await MusicProtocolRECORDTokenManagement.hasRole(
        verifyArtistRole,
        owner.address
      )
    ).to.be.true;
  });
  it("Another user should have no role", async () => {
    expect(
      await MusicProtocolRECORDTokenManagement.hasRole(adminRole, addr1.address)
    ).to.be.false;
    expect(
      await MusicProtocolRECORDTokenManagement.hasRole(minterRole, addr1.address)
    ).to.be.false;
    expect(
      await MusicProtocolRECORDTokenManagement.hasRole(burnerRole, addr1.address)
    ).to.be.false;
    expect(
      await MusicProtocolRECORDTokenManagement.hasRole(
        verifyArtistRole,
        addr1.address
      )
    ).to.be.false;
  });

  describe("MusicProtocolRECORDToken", () => {
    it("The deployer of MusicProtocolRECORDToken should not be able to call a onlyOwner method", async () => {
      await expect(
        MusicProtocolRECORDToken.connect(owner).mint(addr1.address, 10)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    describe("Pausable", () => {
      it("An address without the DEFAULT_ADMIN_ROLE should not be able to pause MusicProtocolRECORDToken", async () => {
        await expect(
          MusicProtocolRECORDTokenManagement.connect(
            addr1
          ).pauseMusicProtocolRECORDToken()
        ).to.be.revertedWith(
          `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${adminRole}`
        );
      });

      it("An address with the DEFAULT_ADMIN_ROLE should be able to pause MusicProtocolRECORDToken", async () => {
        await MusicProtocolRECORDTokenManagement.connect(
          owner
        ).pauseMusicProtocolRECORDToken();
        expect(await MusicProtocolRECORDToken.paused()).to.equal(true);
      });

      it("An address without the DEFAULT_ADMIN_ROLE should not be able to unpause MusicProtocolRECORDToken", async () => {
        await expect(
          MusicProtocolRECORDTokenManagement.connect(
            addr1
          ).unpauseMusicProtocolRECORDToken()
        ).to.be.revertedWith(
          `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${adminRole}`
        );
      });

      it("An address with the DEFAULT_ADMIN_ROLE should be able to unpause MusicProtocolRECORDToken", async () => {
        await MusicProtocolRECORDTokenManagement.connect(
          owner
        ).unpauseMusicProtocolRECORDToken();
        expect(await MusicProtocolRECORDToken.paused()).to.equal(false);
      });
    });

    describe("Minting", () => {
      it("An address with the MINTER_ROLE should be able to mint MusicProtocolRECORDToken", async () => {
        await MusicProtocolRECORDTokenManagement.connect(owner).mint(
          addr1.address,
          10
        );
        expect(await MusicProtocolRECORDToken.balanceOf(addr1.address)).to.equal(
          10
        );
      });

      it("An address without the MINTER_ROLE should not be able to mint MusicProtocolRECORDToken", async () => {
        await expect(
          MusicProtocolRECORDTokenManagement.connect(addr1).mint(addr1.address, 10)
        ).to.be.revertedWith(
          `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${minterRole}`
        );
      });
    });

    describe("Burning", () => {
      before(async () => {
        await MusicProtocolRECORDTokenManagement.connect(owner).mint(
          MusicProtocolRECORDTokenManagement.address,
          10
        );
      });

      it("An address without the BURNERN_ROLE should not be able to burn MusicProtocolRECORDToken", async () => {
        await expect(
          MusicProtocolRECORDTokenManagement.connect(addr1).burn(10)
        ).to.be.revertedWith(
          `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${burnerRole}`
        );
      });

      it("An address with the BURNERN_ROLE should be able to burn MusicProtocolRECORDToken", async () => {
        await MusicProtocolRECORDTokenManagement.grantRole(
          burnerRole,
          addr1.address
        );
        await MusicProtocolRECORDTokenManagement.connect(addr1).burn(10);
        expect(await MusicProtocolRECORDToken.balanceOf(owner.address)).to.equal(0);
      });
    });

    describe("Burning From", () => {
      before(async () => {
        await MusicProtocolRECORDTokenManagement.connect(owner).mint(
          addr2.address,
          10
        );
        await MusicProtocolRECORDToken.connect(addr2).approve(
          MusicProtocolRECORDTokenManagement.address,
          10
        );
        await MusicProtocolRECORDTokenManagement.revokeRole(
          burnerRole,
          addr1.address
        );
      });

      it("An address without the BURNERN_ROLE should not be able to burn MusicProtocolRECORDToken", async () => {
        await expect(
          MusicProtocolRECORDTokenManagement.connect(addr1).burnFrom(
            addr2.address,
            10
          )
        ).to.be.revertedWith(
          `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${burnerRole}`
        );
      });

      it("An address with the BURNERN_ROLE should be able to burn MusicProtocolRECORDToken", async () => {
        await MusicProtocolRECORDTokenManagement.grantRole(
          burnerRole,
          addr1.address
        );
        await MusicProtocolRECORDTokenManagement.connect(addr1).burnFrom(
          addr2.address,
          10
        );
        expect(await MusicProtocolRECORDToken.balanceOf(owner.address)).to.equal(0);
      });
    });

    describe("Transfer Ownership", () => {
      it("An address without the DEFAULT_ADMIN_ROLE should not be able to transfer the ownership of MusicProtocolRECORDToken contract", async () => {
        await expect(
          MusicProtocolRECORDTokenManagement.connect(
            addr1
          ).transferMusicProtocolRECORDToken(fakeDAO.address)
        ).to.be.revertedWith(
          `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${adminRole}`
        );
      });

      it("An address with the DEFAULT_ADMIN_ROLE should be able to transfer the ownership of MusicProtocolRECORDToken contract", async () => {
        await MusicProtocolRECORDTokenManagement.connect(
          owner
        ).transferMusicProtocolRECORDToken(fakeDAO.address);
        await MusicProtocolRECORDToken.connect(fakeDAO).acceptOwnership();
        expect(await MusicProtocolRECORDToken.owner()).to.equal(fakeDAO.address);
      });

      after(async () => {
        await MusicProtocolRECORDToken.connect(fakeDAO).transferOwnership(
          MusicProtocolRECORDTokenManagement.address
        );
        await MusicProtocolRECORDTokenManagement.custom(
          [MusicProtocolRECORDToken.address],
          [calldata]
        );
      });
    });
  });

  describe("ArtistStaking", () => {
    describe("Verified Artist", () => {
      before(async () => {
        await MusicProtocolRECORDTokenManagement.grantRole(
          verifyArtistRole,
          addr1.address
        );
        await MusicProtocolRECORDTokenManagement.grantRole(
          removeArtistRole,
          addr1.address
        );
      });

      it("When an artist is added through ftas should emit an event", async () => {
        await expect(
          MusicProtocolRECORDTokenManagement.connect(addr1).addArtist(
            [artist1.address]
          )
        ).to.emit(ArtistStaking, "ArtistAdded"); //emit event correct
      });

      it("When an artist is removed through ftas should emit an event", async () => {
        await expect(
          MusicProtocolRECORDTokenManagement.connect(addr1).removeArtist(
            [artist1.address]
          )
        ).to.emit(ArtistStaking, "ArtistRemoved"); //emit event correct
      });

      it("Artists can be added by group", async () => {
        await MusicProtocolRECORDTokenManagement.connect(addr1).addArtist([artist1.address, artist2.address]);
        expect(await ArtistStaking.isVerified(artist1.address)).to.be.true;
        expect(await ArtistStaking.isVerified(artist2.address)).to.be.true;
      });

      it("Artists can be removed by group", async () => {
        await MusicProtocolRECORDTokenManagement.connect(addr1).removeArtist([artist1.address, artist2.address]);
        expect(await ArtistStaking.isVerified(artist1.address)).to.be.false;
        expect(await ArtistStaking.isVerified(artist2.address)).to.be.false;
      });

      it("Should revert", async () => {
        await expect(
          MusicProtocolRECORDTokenManagement.connect(artist1).addArtist(
            [artist1.address]
          )
        ).to.be.revertedWith(
          `AccessControl: account ${artist1.address.toLowerCase()} is missing role ${verifyArtistRole}`
        );
        await expect(
          MusicProtocolRECORDTokenManagement.connect(artist1).removeArtist(
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
          MusicProtocolRECORDTokenManagement.connect(
            addr1
          ).transferArtistStaking(fakeDAO.address)
        ).to.be.revertedWith(
          `AccessControl: account ${addr1.address.toLowerCase()} is missing role ${adminRole}`
        );
      });

      it("An address with the DEFAULT_ADMIN_ROLE should be able to transfer the ownership of FTAS contract", async () => {
        await MusicProtocolRECORDTokenManagement.connect(
          owner
        ).transferArtistStaking(fakeDAO.address);
        await ArtistStaking.connect(fakeDAO).acceptOwnership();
        expect(await ArtistStaking.owner()).to.equal(fakeDAO.address);
      });

      after(async () => {
        await ArtistStaking
          .connect(fakeDAO)
          .transferOwnership(MusicProtocolRECORDTokenManagement.address);
        await MusicProtocolRECORDTokenManagement.custom(
          [ArtistStaking.address],
          [calldata]
        );
      });
    });
  });

  describe("Event emitting", () => {
    it("The minting should emit a Mint event", async () => {
      await expect(
        MusicProtocolRECORDTokenManagement.connect(owner).mint(addr1.address, 100)
      )
        .to.emit(MusicProtocolRECORDTokenManagement, "Mint")
        .withArgs(addr1.address, 100, owner.address);
    });

    it("The burning should emit a Burn event", async () => {
      await MusicProtocolRECORDToken.connect(addr1).approve(
        MusicProtocolRECORDTokenManagement.address,
        100
      );
      await expect(
        MusicProtocolRECORDTokenManagement.connect(owner).burnFrom(
          addr1.address,
          100
        )
      )
        .to.emit(MusicProtocolRECORDTokenManagement, "Burn")
        .withArgs(addr1.address, 100, owner.address);
    });
  });
});