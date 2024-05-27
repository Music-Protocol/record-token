import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-gas-reporter";
import "@typechain/hardhat";
import 'solidity-coverage'
import "@nomiclabs/hardhat-web3";
import "@nomiclabs/hardhat-ethers";
import "@openzeppelin/hardhat-upgrades";

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
    // sepolia: {
    //   url: 'https://sepolia.base.org',
    //   accounts: ['OWNER_PRIVATE_KEY']
    // },
    // moonbase: {
    //   url: 'https://rpc.api.moonbase.moonbeam.network',
    //   chainId: 1287,
    //   accounts: ['OWNER_PRIVATE_KEY']
    // },
  },
  etherscan: {
    apiKey: {
      "sepolia": "API_KEY"
    },
    customChains: [
      {
        network: "sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org/"
        }
      }
    ]
  },
}

export default config;