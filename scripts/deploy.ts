// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
import { ethers } from "hardhat";
import { DEXLFactory, DEXLPool, Web3MusicNetworkDAO } from "../typechain-types";

async function main() {
  const defVeReward = 10;
  const defArtistReward = 10;
  const minStakeTime = 10;
  const maxStakeTime = 864000;
  const DEXLRATE = 1;
  const daoQuorum = 10e7;
  const daoMajority = 50e7 + 1;

  const factoryPool = await ethers.getContractFactory('DEXLPool');
  let pool = await factoryPool.deploy() as DEXLPool;
  await pool.deployed();

  const factoryFtas = await ethers.getContractFactory('FanToArtistStaking');
  let fanToArtistStaking = await factoryFtas.deploy();
  await fanToArtistStaking.deployed();

  const factoryDEXLFactory = await ethers.getContractFactory('DEXLFactory');
  let DEXLF = await factoryDEXLFactory.deploy() as DEXLFactory;
  await DEXLF.deployed();

  const Web3MusicNativeTokenFactory = await ethers.getContractFactory('Web3MusicNativeToken');
  let Web3MusicNativeToken = await Web3MusicNativeTokenFactory.deploy(fanToArtistStaking.address, DEXLF.address);
  await Web3MusicNativeToken.deployed();

  await fanToArtistStaking.initialize(Web3MusicNativeToken.address, defVeReward, defArtistReward, minStakeTime, maxStakeTime);
  await DEXLF.initialize(fanToArtistStaking.address, pool.address, Web3MusicNativeToken.address, 864000, DEXLRATE);

  const managementFactory = await ethers.getContractFactory("Web3MusicNativeTokenManagement");
  const Web3MusicNativeTokenManagement = await managementFactory.deploy(Web3MusicNativeToken.address, fanToArtistStaking.address, DEXLF.address);
  await Web3MusicNativeTokenManagement.deployed();

  const daoFactory = await ethers.getContractFactory('Web3MusicNetworkDAO');
  let dao = await daoFactory.deploy(fanToArtistStaking.address, daoQuorum, daoMajority, 864000) as Web3MusicNetworkDAO;
  await dao.deployed();

  await Web3MusicNativeToken.transferOwnership(Web3MusicNativeTokenManagement.address);
  await fanToArtistStaking.transferOwnership(Web3MusicNativeTokenManagement.address);
  await DEXLF.transferOwnership(Web3MusicNativeTokenManagement.address);

  console.log('Web3MusicNativeTokenManagement address', Web3MusicNativeTokenManagement.address);
  console.log('Web3MusicNativeToken address', Web3MusicNativeToken.address);
  console.log('FanToArtistStaking address', fanToArtistStaking.address);
  console.log('DEXLFactory address', DEXLF.address);
  console.log('DAO address', dao.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});