import { web3, addressToken, addressDAO, daoABI } from './utils/contracts';
import { userKey } from "./utils/wallets";

async function main() {
    const dao = new web3.eth.Contract(daoABI, addressDAO);


    const user = web3.eth.accounts.privateKeyToAccount(userKey);
    //This is a proposal that cannot be executed, it is for the execution of the second proposal
    const calldata = web3.eth.abi.encodeFunctionCall(
        {
            name: "mint",
            type: "function",
            inputs: [
                {
                    type: "address",
                    name: "to",
                },
                {
                    type: "uint256",
                    name: "amount",
                },
            ],
        },
        [user.address, `1000`]
    );
    
    const functionToSend = dao.methods.propose([addressToken], [calldata], "Gift to myself");
    const functionABI = functionToSend.encodeABI();

    const transactionObject = {
        from: user.address,
        to: addressDAO,
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