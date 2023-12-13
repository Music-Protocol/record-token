import { web3, addressMGMT, mgmtABI, addressF2A, addressToken, addressDAO } from './utils/contracts';
import { ownerKey } from "./utils/wallets";

async function main() {
  const calldata = web3.eth.abi.encodeFunctionCall({
    name: 'acceptOwnership',
    type: 'function',
    inputs: []
  }, []);

  const mgmt = new web3.eth.Contract(mgmtABI, addressMGMT);

  const owner = web3.eth.accounts.privateKeyToAccount(ownerKey);
  const functionToSend = mgmt.methods.custom([addressF2A, addressToken, addressDAO], [calldata, calldata, calldata]);
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
  console.log(error);
  process.exitCode = 1;
});