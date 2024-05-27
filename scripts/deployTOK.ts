import { ethers } from "hardhat";
import { addressF2A } from "./utils/contracts";

async function deployTOK() {
    const MusicProtocolRECORDTokenFactory = await ethers.getContractFactory('MusicProtocolRECORDToken');
    const MusicProtocolRECORDToken = await MusicProtocolRECORDTokenFactory.deploy(addressF2A);
    console.log("ERC20 deploy");
    await MusicProtocolRECORDToken.deployed();
    console.log("ERC20 deployed");
    console.log("ERC20 address: " + MusicProtocolRECORDToken.address);
}

deployTOK().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
