import { ethers } from "hardhat";
import { web3, addressF2A, f2aABI, addressToken } from './utils/contracts';
import { ownerKey } from "./utils/wallets";

async function initializeF2A() {
    const defArtistReward = 10;
    const minStakeTime = 10;
    const maxStakeTime = 864000;
    const limit = 3;
    const changeRewardLimit = 10;

    const owner = web3.eth.accounts.privateKeyToAccount(ownerKey);
    const f2a = new web3.eth.Contract(f2aABI, addressF2A);
    const functionToSend = f2a.methods.initialize(addressToken, defArtistReward, minStakeTime, maxStakeTime, limit, changeRewardLimit);
    const functionABI = functionToSend.encodeABI();

    const transactionObject = {
        from: owner.address,
        to: addressF2A, 
        gas: 2000000,
        data: functionABI
    };

    const signedTx = await web3.eth.accounts.signTransaction(transactionObject, ownerKey);

    let receipt
    if(signedTx.rawTransaction != undefined){
        receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    }
    
    console.log("Transaction receipt:", receipt);
}

initializeF2A().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
