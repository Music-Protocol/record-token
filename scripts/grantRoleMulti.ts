import { web3, addressMGMT, mgmtABI, addressDAO, daoABI } from './utils/contracts';
import { ownerKey } from "./utils/wallets";

async function main() {
    const mgmt = new web3.eth.Contract(mgmtABI, addressMGMT);
    //It adds user's wallet to dao governance whitelist
    const owner = web3.eth.accounts.privateKeyToAccount(ownerKey);
    const granted = '0xD2F8D1164EC00FE8B13bA5824A078730eb4789e3'; //TODO edit this
    const calldataAdmin = web3.eth.abi.encodeFunctionCall({
        name: 'grantRole',
        type: 'function',
        inputs: [{
            type: 'bytes32',
            name: 'role'
        }, {
            type: 'address',
            name: 'account'
        }]
    }, ['0x0000000000000000000000000000000000000000000000000000000000000000', granted]);


    const calldataTGE = web3.eth.abi.encodeFunctionCall({
        name: 'grantRole',
        type: 'function',
        inputs: [{
            type: 'bytes32',
            name: 'role'
        }, {
            type: 'address',
            name: 'account'
        }]
    }, ['0x53705c9e5a8476131a17c0a6debb701e98c7c0208f3626128e72d5048f897d7b', granted]);

    const functionToSend = mgmt.methods.custom([addressMGMT, addressMGMT], [calldataAdmin, calldataTGE]);
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