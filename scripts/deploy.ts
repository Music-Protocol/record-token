// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
import { ethers, upgrades, web3 } from "hardhat";
import { MusicProtocolDAO } from "../typechain-types";

async function main() {
  const defArtistReward = 10;
  const minStakeTime = 10;
  const maxStakeTime = 864000;
  const limit = 3;
  const changeRewardLimit = 600;
  const daoQuorum = 10e7;
  const daoMajority = 50e7 + 1;

  const factoryFtas = await ethers.getContractFactory('ArtistStaking');
  const ArtistStaking = await upgrades.deployProxy(factoryFtas, [], { initializer: false, kind: 'uups', timeout: 180000 });
  console.log("FTA deploy");
  await ArtistStaking.deployed();
  console.log("FTA deployed");

  const MusicProtocolRECORDTokenFactory = await ethers.getContractFactory('MusicProtocolRECORDToken');
  let MusicProtocolRECORDToken = await MusicProtocolRECORDTokenFactory.deploy(ArtistStaking.address);
  console.log("ERC20 deploy");
  await MusicProtocolRECORDToken.deployed();
  console.log("ERC20 deployed");

  await ArtistStaking.initialize(MusicProtocolRECORDToken.address, defArtistReward, minStakeTime, maxStakeTime, limit, changeRewardLimit);

  const managementFactory = await ethers.getContractFactory("MusicProtocolRECORDTokenManagement");
  const MusicProtocolRECORDTokenManagement = await managementFactory.deploy(MusicProtocolRECORDToken.address, ArtistStaking.address);
  console.log("MGMT deploy");
  await MusicProtocolRECORDTokenManagement.deployed();
  console.log("MGMT deployed");

  const daoFactory = await ethers.getContractFactory('MusicProtocolDAO');            //The proposal can be executed only after 10 minutes
  let dao = await daoFactory.deploy(ArtistStaking.address, daoQuorum, daoMajority, 600, true) as MusicProtocolDAO;
  console.log("DAO deploy");
  await dao.deployed();
  console.log("DAO deployed");

  const tokown = await MusicProtocolRECORDToken.transferOwnership(MusicProtocolRECORDTokenManagement.address);
  await tokown.wait();
  console.log("Ownership 1");
  const f2aown = await ArtistStaking.transferOwnership(MusicProtocolRECORDTokenManagement.address);
  await f2aown.wait();
  console.log("Ownership 2");
  const daoown = await dao.transferOwnership(MusicProtocolRECORDTokenManagement.address);
  await daoown.wait();
  console.log("Ownership 3");
  const mgmtown = await MusicProtocolRECORDTokenManagement.grantRole('0x0000000000000000000000000000000000000000000000000000000000000000', MusicProtocolRECORDTokenManagement.address);
  await mgmtown.wait();
  console.log("Token self assign");

  const acceptOwnership = web3.eth.abi.encodeFunctionCall({
    name: 'acceptOwnership',
    type: 'function',
    inputs: []
  }, []);
  await MusicProtocolRECORDTokenManagement.custom(
    [MusicProtocolRECORDToken.address, ArtistStaking.address, dao.address],
    [acceptOwnership, acceptOwnership, acceptOwnership]);
  console.log('MusicProtocolRECORDTokenManagement address', MusicProtocolRECORDTokenManagement.address);
  console.log('MusicProtocolRECORDToken address', MusicProtocolRECORDToken.address);
  console.log('ArtistStaking address', ArtistStaking.address);
  console.log('DAO address', dao.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});