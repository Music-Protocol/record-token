import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-gas-reporter";
import "@typechain/hardhat";
import 'solidity-coverage'
require("dotenv").config();

const config: HardhatUserConfig = {
  solidity: "0.8.16",
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
    },
    localganache: {
      url: process.env.PROVIDER_URL,
      accounts: [`0x${process.env.PRIVATE_KEY}`]
    }
  }
};

export default config;