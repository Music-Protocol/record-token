import { web3, addressMGMT, mgmtABI } from './utils/contracts';
import { ownerKey, user1Key} from "./utils/wallets";

async function main() {
    const mgmt = new web3.eth.Contract(mgmtABI, addressMGMT);

    const owner = web3.eth.accounts.privateKeyToAccount(ownerKey);
    const user = web3.eth.accounts.privateKeyToAccount(user1Key);
    //Owner burns 1000 tokens from user
    const functionToSend = mgmt.methods.burnFrom(user.address, 10n*10n**18n);
    const functionABI = functionToSend.encodeABI();

    const transactionObject = {
        from: owner.address,
        to: addressMGMT,
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