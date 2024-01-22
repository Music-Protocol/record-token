import { web3, addressMGMT, mgmtABI } from './utils/contracts';
import { ownerKey, user2Key} from "./utils/wallets";

async function main() {
    const mgmt = new web3.eth.Contract(mgmtABI, addressMGMT);

    const owner = web3.eth.accounts.privateKeyToAccount(ownerKey);
    const user = web3.eth.accounts.privateKeyToAccount(user2Key);
    //The owner performs a mint that releases the tokens in a gardual way.
    const functionToSend = mgmt.methods.mint_and_lock(user.address, 1000n*10n**18n, Math.round(Date.now()/1000) ,1200);
    web3.eth.getBlock('latest', (error, block) => {
        if (!error) {
        console.log(block.timestamp);
        console.log(Math.round(Date.now()/1000));
        }
    });
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