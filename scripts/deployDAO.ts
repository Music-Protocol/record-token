import { ethers } from "hardhat";
import { addressF2A } from "./utils/contracts";

async function deployDAO() {
    const daoQuorum = 10e7;
    const daoMajority = 50e7 + 1;

    const daoFactory = await ethers.getContractFactory('Web3MusicNetworkDAO');            
    let dao = await daoFactory.deploy(addressF2A, daoQuorum, daoMajority, 600, true) //The proposal can be executed only after 10 minutes
    console.log("DAO deploy");
    await dao.deployed();
    console.log("DAO deployed");
    console.log("DAO address:" + dao.address);
}

deployDAO().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
