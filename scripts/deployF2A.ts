import { ethers, upgrades } from "hardhat";

async function deployFTA() {
    const factoryFtas = await ethers.getContractFactory('ArtistStaking');
    const ArtistStaking = await upgrades.deployProxy(factoryFtas, [], { initializer: false, kind: 'uups', timeout: 180000 });
    console.log("FTA deploy");
    await ArtistStaking.deployed();
    console.log("FTA deployed");
    console.log("FTA address: " + ArtistStaking.address);
}

deployFTA().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

