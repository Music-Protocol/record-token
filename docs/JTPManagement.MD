# JTPManagement Smart Contract
The `JTPManagement` smart contract is based on the following **openzeppelin** standards:
- `AccessControl` to restrict the access of some resources to a bucket of addresses
- `Address` to check the result of call on other smart contracts

### Roles
There are 4 roles in addition to the default admin role:
- `MINTER` and `BURNER` for the respective functions of JTP
- `FACTORY_MANAGER` for accepting or rejecting DEXLPool proposals
- `VERIFY_ARTIST` to add/remove verified artists

## Contract Properties
Note that this contract is initialized via the constructor and is therefore **not** updatable. However, contract ownership can be transferred to a new version or to the DAO

## code snippets
### deployment
In order to deploy correctly this smart contract the following smart contracts must already be deployed in order to pass their addresses. (**JTP**, **FanToArtistStaking** and **DEXLFactory**)
```
...
const managementFactory = await ethers.getContractFactory("JTPManagement");
const jtpManagement = await managementFactory.deploy(jtp.address, fanToArtistStaking.address, DEXLF.address);
await jtpManagement.deployed()
...
await jtp.transferOwnership(jtpManagement.address);
await fanToArtistStaking.transferOwnership(jtpManagement.address);
await DEXLF.transferOwnership(jtpManagement.address);
```

### Roles
#### grant a role
```
burnerRole = await jtpManagement.BURNER_ROLE();
jtpManagement.grantRole(burnerRole, addr1.address);
```
#### check if someone has a role
```
burnerRole = await jtpManagement.BURNER_ROLE();
jtpManagement.hasRole(burnerRole, addr1.address)
```
#### revoke a role
```
burnerRole = await jtpManagement.BURNER_ROLE();
jtpManagement.revokeRole(burnerRole, addr1.address);
```
### mint and burn
The corresponding roles are required and obviously the management contract must be the owner of the contract called, `jtp` in this case
```
jtpManagement.mint(addr1.address, 10)

jtpManagement.burn(10)


jtp.connect(addr1).approve(jtpManagement.address, 10)
jtpManagement.burnFrom(addr1.address, 10)
```

### add and remove of artist
Obviously in order to add and remove artists the management contract must be the owner of the contract called, `fanToArtistStaking` in this case, and the caller must have the role `VERIFY_ARTIST_ROLE`
```
jtpManagement.addArtist(artist1.address)
jtpManagement.removeArtist(artist1.address)
```

### approve or decline a DEXLPool
to be able to accept or reject a proposed pool the management contract must be the owner of the contract called, `DEXLFactory` in this case, and the caller must have the role `VERIFY_ARTIST_ROLE`
```
jtpManagement.approveProposal(proposalHash)
jtpManagement.declineProposal(proposalHash)
```

### change reward rate
To be able to change reward rates you need to have the `ADMIN` role and the management has to be the owner of the contracts called (`DEXLFactory` or `FanToArtistStaking`), if ownership is transferred to the `DAO` it will no longer be possible to change rates or approve/reject DEXLPool via the Factory. 
Look at the respective documents (also detailed) to understand how to set the reward rate to achieve the desired result.
```
jtpManagement.changeDEXLRewardRate(newRate)
jtpManagement.changeArtistRewardRate(newRate)
```


### custom
This function can only be called by those who have the role of `ADMIN`, this function has the power to perform **any** operation including those listed above, since there are no controls. The purpose of this function is to communicate with DEXLPools in order to take over them and propose funding.
```
jtpManagement.custom(arrayOfDEXLPoolAddress, arrayOfCallData)
```
**This function could be modified to accept only DEXLPool addresses verified by a call to DEXLFactory and use a DEXLPool interface and set the message sender as leader. But then it will be necessary to transfer all contracts to a JTPManagementV2 if it is necessary to interact with functions not implemented in this contract**


# Key Takeaway
Look at the bold part of the custom section. 
If ownership of `DEXLFactory` is transferred to the `DAO` with the intention of having pools approved, the consequence is that it will no longer be possible to change the `DEXLRewardRate` as well. And every pool that will be approved will have the `DAO` as owner and not the `management`, it will **not** be possible to take over if necessary. The same applies to `FanToArtistStaking` with the whitelist of verified artists and the reward rate.

This contract is **not** upgradeable but all ownership can be transferred to a more advanced version

Any address with the `ADMIN` role can perform **any** type of function on **any** contract on the blockchain via the **custom** function














