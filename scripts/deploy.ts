// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
import { ethers, upgrades, web3 } from "hardhat";
import { ArtistStaking, MusicProtocolDAO } from "../typechain-types";

async function main() {
  const defArtistReward = 10;
  const minStakeTime = 10;
  const maxStakeTime = 864000;
  const limit = 3;
  const changeRewardLimit = 601;
  const daoQuorum = 10e7;
  const daoMajority = 50e7 + 1;



  //deploy F2A
  const factoryFtas = await ethers.getContractFactory('ArtistStaking');
  const stake = await upgrades.deployProxy(factoryFtas, [], { initializer: false, kind: 'uups', timeout: 180000 }) as ArtistStaking;
  console.log("FTA deploy");
  await stake.deployed();
  console.log("FTA deployed");
  console.log("FTA address: " + stake.address);

  //deploy Token
  const MusicProtocolRECORDTokenFactory = await ethers.getContractFactory('MusicProtocolRECORDToken');
  const token = await MusicProtocolRECORDTokenFactory.deploy(stake.address);
  console.log("ERC20 deploy");
  await token.deployed();
  console.log("ERC20 deployed");
  console.log("ERC20 address: " + token.address);

  //init f2a with token info
  await stake.initialize(
    token.address,
    defArtistReward,
    minStakeTime,
    maxStakeTime,
    limit,
    changeRewardLimit
  )

  //deploy DAO but needs F2A
  const daoFactory = await ethers.getContractFactory('MusicProtocolDAO');
  const dao = await daoFactory.deploy(stake.address, daoQuorum, daoMajority, 600, true) //The proposal can be executed only after 10 minutes
  console.log("DAO deploy");
  await dao.deployed();
  console.log("DAO deployed");
  console.log("DAO address:" + dao.address);

  const managementFactory = await ethers.getContractFactory("MusicProtocolRECORDTokenManagement");
  const mgmt = await managementFactory.deploy(token.address, stake.address);
  console.log("MGMT deploy");
  await mgmt.deployed();
  console.log("MGMT deployed");
  console.log("MGMT address: " + mgmt.address);


  // admin roles
  const admins = [
    mgmt.address, //we gave the contract the owner itself to call his functions
    // ADD HERE OTHER ADDRESSES
  ]
  for (let admin of admins) {
    await mgmt.grantRole(await mgmt.DEFAULT_ADMIN_ROLE(), admin)
  }

  // transfer ownerships of f2a, token and dao
  await stake.transferOwnership(mgmt.address);
  await token.transferOwnership(mgmt.address);
  await dao.transferOwnership(mgmt.address);
  const calldata = web3.eth.abi.encodeFunctionCall({
    name: 'acceptOwnership',
    type: 'function',
    inputs: []
  }, []);
  await mgmt.custom([stake.address, token.address, dao.address], [calldata, calldata, calldata]);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});