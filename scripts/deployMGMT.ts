import { ethers } from "hardhat";
import { addressToken, addressF2A } from "./utils/contracts";

async function deployMGMT(){
    const managementFactory = await ethers.getContractFactory("Web3MusicNativeTokenManagement");
    const Web3MusicNativeTokenManagement = await managementFactory.deploy(addressToken, addressF2A);
    console.log("MGMT deploy");
    await Web3MusicNativeTokenManagement.deployed();
    console.log("MGMT deployed");
    console.log("MGMT address: " + Web3MusicNativeTokenManagement.address);
}

deployMGMT().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});


