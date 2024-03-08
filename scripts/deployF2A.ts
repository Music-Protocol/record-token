import { ethers, upgrades } from "hardhat";

async function deployFTA() {
    const factoryFtas = await ethers.getContractFactory('FanToArtistStaking');
    const fanToArtistStaking = await upgrades.deployProxy(factoryFtas, [], {initializer: false, kind: 'uups', timeout: 180000});
    console.log("FTA deploy");
    await fanToArtistStaking.deployed();
    console.log("FTA deployed");
    console.log("FTA address: " + fanToArtistStaking.address);
}

deployFTA().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

