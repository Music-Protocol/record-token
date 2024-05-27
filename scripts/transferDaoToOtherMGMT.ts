import { web3, daoABI, tokenABI, addressF2A, addressMGMT, } from './utils/contracts';
import { ownerKey } from "./utils/wallets";

async function main() {
    const dao = new web3.eth.Contract(tokenABI, addressF2A);


    const owner = web3.eth.accounts.privateKeyToAccount(ownerKey);
    
    const functionToSend = dao.methods.transferOwnership(addressMGMT);
    const functionABI = functionToSend.encodeABI();

    const transactionObject = {
        from: owner.address,
        to: addressF2A,
        gas: 2000000,
        data: functionABI
    };

    const signedTx = await web3.eth.accounts.signTransaction(transactionObject, ownerKey);

    let receipt;
    if (signedTx.rawTransaction != undefined) {
        receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    }

    console.log("Transaction receipt:", receipt);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});