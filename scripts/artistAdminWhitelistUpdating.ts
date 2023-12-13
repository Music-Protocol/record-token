import { web3, addressMGMT, mgmtABI } from './utils/contracts';
import { ownerKey, adminKey } from "./utils/wallets";

async function main() {
  const mgmt = new web3.eth.Contract(mgmtABI, addressMGMT);

  const owner = web3.eth.accounts.privateKeyToAccount(ownerKey);
  const admin = web3.eth.accounts.privateKeyToAccount(adminKey);

  let functionToSend = mgmt.methods.grantRole(web3.utils.keccak256("VERIFY_ARTIST_ROLE"), admin.address);
  let functionABI = functionToSend.encodeABI();

  let transactionObject = {
    from: owner.address,
    to: addressMGMT,
    gas: 2000000,
    data: functionABI
  };

  let signedTx = await web3.eth.accounts.signTransaction(transactionObject, ownerKey);

  let receipt;
  if (signedTx.rawTransaction != undefined) {
    receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
  }

  console.log("VERIFY_ARTIST_ROLE receipt:", receipt);

  functionToSend = mgmt.methods.grantRole(web3.utils.keccak256("REMOVE_ARTIST_ROLE"), admin.address);
  functionABI = functionToSend.encodeABI();

  transactionObject = {
    from: owner.address,
    to: addressMGMT,
    gas: 2000000,
    data: functionABI
  };

  signedTx = await web3.eth.accounts.signTransaction(transactionObject, ownerKey);

  receipt;
  if (signedTx.rawTransaction != undefined) {
    receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
  }

  console.log("REMOVE_ARTIST_ROLE receipt:", receipt);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});