import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-waffle";
import 'solidity-coverage'
require("dotenv").config();

const config: HardhatUserConfig = {
  solidity: "0.8.7",
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