import { web3, addressF2A, f2aABI } from "./utils/contracts";
import { ownerKey } from "./utils/wallets";

async function main() {
    const f2a = new web3.eth.Contract(f2aABI, addressF2A);

    // const artist = web3.eth.accounts.privateKeyToAccount(artistKey);
    //Artist claims the reward by f2a contract
    const owner = web3.eth.accounts.privateKeyToAccount(ownerKey);

    const functionToSend = f2a.methods.getReward('0xD459D743E920Dd2b7C3D0cA92840E785685baEf5');
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