import { web3, addressMGMT, mgmtABI, tokenABI, addressToken } from './utils/contracts';
import { ownerKey, user1Key } from "./utils/wallets";

async function main() {
    const token = new web3.eth.Contract(tokenABI, addressToken);

    const owner = web3.eth.accounts.privateKeyToAccount(ownerKey);
    // const user = web3.eth.accounts.privateKeyToAccount(user1Key);
    //The owner mints 10 tokens to user
    const functionToSend = token.methods.approve(addressMGMT, 10000n * 10n ** 18n);
    const functionABI = functionToSend.encodeABI();

    const transactionObject = {
        from: owner.address,
        to: addressToken,
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