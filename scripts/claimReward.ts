import { web3, addressF2A, f2aABI } from "./utils/contracts";
import { artistKey } from "./utils/wallets";

async function main() {
    const f2a = new web3.eth.Contract(f2aABI, addressF2A);

    const artist = web3.eth.accounts.privateKeyToAccount(artistKey);
    //Artist claims the reward by f2a contract
    const functionToSend = f2a.methods.getReward(artist.address);
    const functionABI = functionToSend.encodeABI();

    const transactionObject = {
        from: artist.address,
        to: addressF2A,
        gas: 2000000,
        data: functionABI
    };

    const signedTx = await web3.eth.accounts.signTransaction(transactionObject, artistKey);

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