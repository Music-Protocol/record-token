// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");

async function main() {

  const JTP = await hre.ethers.getContractFactory("JTP");
  const jtp = await JTP.deploy();
  await jtp.deployed();
  // do jtp.mint as the pp whitepaper  
  console.log( `deployed JTP to ${jtp.address}` );

  const JTPManagement = await hre.ethers.getContractFactory("JTP");
  const jtpManagement = await JTPManagement.deploy(jtp.address);
  await jtpManagement.deployed();
  await jtp.transferOwnership(jtpManagement.address);
  console.log( `deployed JTPManagement to ${jtpManagement.address}` );

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});