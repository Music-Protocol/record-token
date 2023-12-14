import { web3, addressF2A, f2aABI } from "./utils/contracts";
import { userKey, artistKey } from "./utils/wallets";

async function main() {
    const f2a = new web3.eth.Contract(f2aABI, addressF2A);

    const user = web3.eth.accounts.privateKeyToAccount(userKey);
    const artist = web3.eth.accounts.privateKeyToAccount(artistKey);
    //User increases the amount of tokens put into stake
    const functionToSend = f2a.methods.increaseAmountStaked(artist.address, 10n*10n**18n);
    const functionABI = functionToSend.encodeABI();

    const transactionObject = {
        from: user.address,
        to: addressF2A,
        gas: 2000000,
        data: functionABI
    };

    const signedTx = await web3.eth.accounts.signTransaction(transactionObject, userKey);

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