import { web3, addressDAO, addressMGMT2, mgmtABI, addressMGMT } from './utils/contracts';
import { ownerKey} from "./utils/wallets";

async function main() {
    const mgmt1 = new web3.eth.Contract(mgmtABI, addressMGMT);


    const owner = web3.eth.accounts.privateKeyToAccount(ownerKey);

    const calldata = web3.eth.abi.encodeFunctionCall(
        {
            name: "transferOwnership",
            type: "function",
            inputs: [
                {
                    type: "address",
                    name: "newOwner",
                }
            ],
        },
        [addressMGMT2]
    );
    
    const functionToSend = mgmt1.methods.custom([addressDAO], [calldata]);
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