import { ethers } from "hardhat";
import { addressF2A } from "./utils/contracts";

async function deployTOK() {
    const Web3MusicNativeTokenFactory = await ethers.getContractFactory('Web3MusicNativeToken');
    const Web3MusicNativeToken = await Web3MusicNativeTokenFactory.deploy(addressF2A);
    console.log("ERC20 deploy");
    await Web3MusicNativeToken.deployed();
    console.log("ERC20 deployed");
    console.log("ERC20 address: " + Web3MusicNativeToken.address);
}

deployTOK().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
