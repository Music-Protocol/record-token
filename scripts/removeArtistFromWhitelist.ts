import { web3, addressMGMT, mgmtABI } from './utils/contracts';
import { adminKey, artistKey } from "./utils/wallets";

async function main() {
    const mgmt = new web3.eth.Contract(mgmtABI, addressMGMT);

    const admin = web3.eth.accounts.privateKeyToAccount(adminKey);
    const artist = web3.eth.accounts.privateKeyToAccount(artistKey);
    //Amdin removes artist from artist whitelist
    const functionToSend = mgmt.methods.removeArtist([artist.address]);
    const functionABI = functionToSend.encodeABI();

    const transactionObject = {
        from: admin.address,
        to: addressMGMT,
        gas: 2000000,
        data: functionABI
    };

    const signedTx = await web3.eth.accounts.signTransaction(transactionObject, adminKey);

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