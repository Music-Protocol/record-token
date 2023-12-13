import { web3, addressMGMT, mgmtABI, addressDAO, daoABI } from './utils/contracts';
import { ownerKey, userKey } from "./utils/wallets";

async function main() {
    const mgmt = new web3.eth.Contract(mgmtABI, addressMGMT);

    const owner = web3.eth.accounts.privateKeyToAccount(ownerKey);
    const user = web3.eth.accounts.privateKeyToAccount(userKey);

    const calldata = web3.eth.abi.encodeFunctionCall({
        name: 'manageWhitelist',
        type: 'function',
        inputs: [{
            type: 'address',
            name: 'target'
        }, {
            type: 'bool',
            name: 'whitelist'
        }]
    }, [user.address, 'true']);

    const functionToSend = mgmt.methods.custom([addressDAO], [calldata]);
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