import { AbiItem } from 'web3-utils'
import Web3 from "web3";
import { readFileSync } from 'fs';
const providerUrl = 'https://base-sepolia.blastapi.io/APIKEY';
const web3 = new Web3(providerUrl);

const f2aABI = JSON.parse(readFileSync('./artifacts/contracts/ArtistStaking.sol/ArtistStaking.json', 'utf8')).abi as AbiItem;
const daoABI = JSON.parse(readFileSync('./artifacts/contracts/MusicProtocolRECORDToken.sol/MusicProtocolRECORDToken.json', 'utf8')).abi as AbiItem;
const tokenABI = JSON.parse(readFileSync('./artifacts/contracts/MusicProtocolDAO.sol/MusicProtocolDAO.json', 'utf8')).abi as AbiItem;
const mgmtABI = JSON.parse(readFileSync('./artifacts/contracts/MusicProtocolRECORDTokenManagement.sol/MusicProtocolRECORDTokenManagement.json', 'utf8')).abi as AbiItem;


const addressDAO = '0x5e61fccb0305e8c226d70734848206e97f1b887c';
const addressMGMT = '0xadf7eef38d4ded93c8591c9becf35e8a6fe7b290';
const addressF2A = '0xe825f044d52194dc579780ab62466117f34cb7ce';
const addressToken = '0xe83c6c35efc36f70dcb5198fdeac9b4fe710580a';

export { mgmtABI, addressMGMT, daoABI, addressDAO, f2aABI, addressF2A, tokenABI, addressToken, web3 };