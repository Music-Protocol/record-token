// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
import { ethers } from "hardhat";
import { Web3MusicNetworkDAO } from "../typechain-types";

async function main() {
  const defArtistReward = 10;
  const minStakeTime = 10;
  const maxStakeTime = 864000;
  const limit = 3;
  const changeRewardLimit = 10;
  const daoQuorum = 10e7;
  const daoMajority = 50e7 + 1;

  const factoryFtas = await ethers.getContractFactory('FanToArtistStaking');
  let fanToArtistStaking = await factoryFtas.deploy();
  console.log("FTA deploy");
  await fanToArtistStaking.deployed();
  console.log("FTA deployed");

  const Web3MusicNativeTokenFactory = await ethers.getContractFactory('Web3MusicNativeToken');
  let Web3MusicNativeToken = await Web3MusicNativeTokenFactory.deploy(fanToArtistStaking.address);
  console.log("ERC20 deploy");
  await Web3MusicNativeToken.deployed();
  console.log("ERC20 deployed");

  await fanToArtistStaking.initialize(Web3MusicNativeToken.address, defArtistReward, minStakeTime, maxStakeTime, limit, changeRewardLimit);

  const managementFactory = await ethers.getContractFactory("Web3MusicNativeTokenManagement");
  const Web3MusicNativeTokenManagement = await managementFactory.deploy(Web3MusicNativeToken.address, fanToArtistStaking.address);
  console.log("MGMT deploy");
  await Web3MusicNativeTokenManagement.deployed();
  console.log("MGMT deployed");

  const daoFactory = await ethers.getContractFactory('Web3MusicNetworkDAO');            //The proposal can be executed only after 10 minutes
  let dao = await daoFactory.deploy(fanToArtistStaking.address, daoQuorum, daoMajority, 600, true) as Web3MusicNetworkDAO;
  console.log("DAO deploy");
  await dao.deployed();
  console.log("DAO deployed");

  const tokown = await Web3MusicNativeToken.transferOwnership(Web3MusicNativeTokenManagement.address);
  await tokown.wait();
  console.log("Ownership 1");
  const f2aown = await fanToArtistStaking.transferOwnership(Web3MusicNativeTokenManagement.address);
  await f2aown.wait();
  console.log("Ownership 2");
  const daoown = await dao.transferOwnership(Web3MusicNativeTokenManagement.address);
  await daoown.wait();
  console.log("Ownership 3");

  console.log('Web3MusicNativeTokenManagement address', Web3MusicNativeTokenManagement.address);
  console.log('Web3MusicNativeToken address', Web3MusicNativeToken.address);
  console.log('FanToArtistStaking address', fanToArtistStaking.address);
  console.log('DAO address', dao.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});