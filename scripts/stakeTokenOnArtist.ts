import { web3, addressF2A, f2aABI } from "./utils/contracts";
import { user2Key, user1Key, artistKey } from "./utils/wallets";

async function main() {
    const f2a = new web3.eth.Contract(f2aABI, addressF2A);

    const user = web3.eth.accounts.privateKeyToAccount(user1Key);
    const artist = web3.eth.accounts.privateKeyToAccount(artistKey);
    //The user stakes 20 tokens, to make stakes he can also use locked tokens.
    const functionToSend = f2a.methods.stake(artist.address, 500n*10n**18n, 600);
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