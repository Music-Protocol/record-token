import { ethers } from "hardhat";

async function deployFTA() {
    const factoryFtas = await ethers.getContractFactory('FanToArtistStaking');
    let fanToArtistStaking = await factoryFtas.deploy();
    console.log("FTA deploy");
    await fanToArtistStaking.deployed();
    console.log("FTA deployed");
    console.log("FTA address: " + fanToArtistStaking.address);
}

deployFTA().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

