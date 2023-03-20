// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
import { ethers } from "hardhat";
import { DEXLFactory, DEXLPool, PublicPressureDAO } from "../typechain-types";

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

  const jtpFactory = await ethers.getContractFactory('JTP');
  let jtp = await jtpFactory.deploy(fanToArtistStaking.address, DEXLF.address);
  await jtp.deployed();

  await fanToArtistStaking.initialize(jtp.address, defVeReward, defArtistReward, minStakeTime, maxStakeTime);
  await DEXLF.initialize(fanToArtistStaking.address, pool.address, jtp.address, 864000, DEXLRATE);

  const managementFactory = await ethers.getContractFactory("JTPManagement");
  const jtpManagement = await managementFactory.deploy(jtp.address, fanToArtistStaking.address, DEXLF.address);
  await jtpManagement.deployed();

  const daoFactory = await ethers.getContractFactory('PublicPressureDAO');
  let dao = await daoFactory.deploy(fanToArtistStaking.address, daoQuorum, daoMajority, 864000) as PublicPressureDAO;
  await dao.deployed();

  await jtp.transferOwnership(jtpManagement.address);
  await fanToArtistStaking.transferOwnership(jtpManagement.address);
  await DEXLF.transferOwnership(jtpManagement.address);

  console.log('JTPManagement address', jtpManagement.address);
  console.log('JTP address', jtp.address);
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