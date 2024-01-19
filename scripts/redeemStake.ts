import { web3, addressF2A, f2aABI } from "./utils/contracts";
import { user1Key, user2Key, artistKey } from "./utils/wallets";

async function main() {
    const f2a = new web3.eth.Contract(f2aABI, addressF2A);

    const user = web3.eth.accounts.privateKeyToAccount(user1Key);
    const artist = web3.eth.accounts.privateKeyToAccount(artistKey);
    //User redeem tokens from artist stake
    const functionToSend = f2a.methods.redeem(artist.address, user.address);
    const functionABI = functionToSend.encodeABI();

    const transactionObject = {
        from: user.address,
        to: addressF2A,
        gas: 2000000,
        data: functionABI
    };

    const signedTx = await web3.eth.accounts.signTransaction(transactionObject, user1Key);

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