import { AbiItem } from 'web3-utils'
import Web3 from "web3";
import { readFileSync } from 'fs';
const providerUrl = 'https://eth-sepolia.blastapi.io/KEY';
const web3 = new Web3(providerUrl);

const f2aABI = JSON.parse(readFileSync('./artifacts/contracts/FanToArtistStaking.sol/FanToArtistStaking.json', 'utf8')).abi as AbiItem;
const daoABI = JSON.parse(readFileSync('./artifacts/contracts/Web3MusicNativeToken.sol/Web3MusicNativeToken.json', 'utf8')).abi as AbiItem;
const tokenABI = JSON.parse(readFileSync('./artifacts/contracts/Web3MusicNativeTokenDAO.sol/Web3MusicNetworkDAO.json', 'utf8')).abi as AbiItem;
const mgmtABI = JSON.parse(readFileSync('./artifacts/contracts/Web3MusicNativeTokenManagement.sol/Web3MusicNativeTokenManagement.json', 'utf8')).abi as AbiItem;


const addressDAO = '0xed5da087eab1599ac88bf888f94a914780fc09ab';
const addressMGMT = '0x374af6ef6600f170e0fd7d29d953d88e99028aaf';
const addressF2A = '0x438f4ce00bdfabf473d02a5bda32ff9c71ea0dc0';
const addressToken = '0xc84c397c420d17e691cdb28da2d5a4f5dae2d19f';

export { mgmtABI, addressMGMT, daoABI, addressDAO, f2aABI, addressF2A, tokenABI, addressToken, web3 };