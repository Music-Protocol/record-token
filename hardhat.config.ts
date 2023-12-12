import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-gas-reporter";
import "@typechain/hardhat";
import 'solidity-coverage'
import "@nomiclabs/hardhat-web3";

require("dotenv").config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.18",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
  networks: {
    moonbase: {
      url: 'https://rpc.api.moonbase.moonbeam.network',
      chainId: 1287,
      accounts: ['PRIVATE_KEY']
    },
    // localganache: {
    //   url: process.env.PROVIDER_URL,
    //   accounts: [`0x${process.env.PRIVATE_KEY}`]
    // }
  }
};

export default config;