import { ethers } from "hardhat";
import { addressToken, addressF2A } from "./utils/contracts";

async function deployMGMT() {
    const managementFactory = await ethers.getContractFactory("MusicProtocolRECORDTokenManagement");
    const MusicProtocolRECORDTokenManagement = await managementFactory.deploy(addressToken, addressF2A);
    console.log("MGMT deploy");
    await MusicProtocolRECORDTokenManagement.deployed();
    console.log("MGMT deployed");
    console.log("MGMT address: " + MusicProtocolRECORDTokenManagement.address);
}

deployMGMT().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});


