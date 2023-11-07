# Web3MusicNativeTokenManagement Smart Contract
The `Web3MusicNativeTokenManagement` smart contract is based on the following **openzeppelin** standards:
- `AccessControl` to restrict the access of some resources to a bucket of addresses
- `Address` to check the result of call on other smart contracts

### Roles
There are 4 roles in addition to the default admin role:
- `MINTER` and `BURNER` for the respective functions of Web3MusicNativeToken
- `VERIFY_ARTIST` to add/remove verified artists

## Contract Properties
Note that this contract is initialized via the constructor and is therefore **not** updatable. However, contract ownership can be transferred to a new version or to the DAO

## code snippets
### deployment
In order to deploy correctly this smart contract the following smart contracts must already be deployed in order to pass their addresses. (**Web3MusicNativeToken**, **FanToArtistStaking**)
```
...
const managementFactory = await ethers.getContractFactory("Web3MusicNativeTokenManagement");
const Web3MusicNativeTokenManagement = await managementFactory.deploy(Web3MusicNativeToken.address, fanToArtistStaking.address);
await Web3MusicNativeTokenManagement.deployed()
...
await Web3MusicNativeToken.transferOwnership(Web3MusicNativeTokenManagement.address);
await fanToArtistStaking.transferOwnership(Web3MusicNativeTokenManagement.address);
```

### Roles
#### grant a role
```
burnerRole = await Web3MusicNativeTokenManagement.BURNER_ROLE();
Web3MusicNativeTokenManagement.grantRole(burnerRole, addr1.address);
```
#### check if someone has a role
```
burnerRole = await Web3MusicNativeTokenManagement.BURNER_ROLE();
Web3MusicNativeTokenManagement.hasRole(burnerRole, addr1.address)
```
#### revoke a role
```
burnerRole = await Web3MusicNativeTokenManagement.BURNER_ROLE();
Web3MusicNativeTokenManagement.revokeRole(burnerRole, addr1.address);
```
### mint and burn
The corresponding roles are required and obviously the management contract must be the owner of the contract called, `Web3MusicNativeToken` in this case
```
Web3MusicNativeTokenManagement.mint(addr1.address, 10)

Web3MusicNativeTokenManagement.burn(10)


Web3MusicNativeToken.connect(addr1).approve(Web3MusicNativeTokenManagement.address, 10)
Web3MusicNativeTokenManagement.burnFrom(addr1.address, 10)
```

### add and remove of artist
Obviously in order to add and remove artists the management contract must be the owner of the contract called, `fanToArtistStaking` in this case, and the caller must have the role `VERIFY_ARTIST_ROLE`
```
Web3MusicNativeTokenManagement.addArtist(artist1.address)
Web3MusicNativeTokenManagement.removeArtist(artist1.address)
```

```
Web3MusicNativeTokenManagement.approveProposal(proposalHash)
Web3MusicNativeTokenManagement.declineProposal(proposalHash)
```

### change reward rate
To be able to change reward rates you need to have the `ADMIN` role and the management has to be the owner of the contracts called (`FanToArtistStaking`)
Look at the respective documents (also detailed) to understand how to set the reward rate to achieve the desired result.
```
Web3MusicNativeTokenManagement.changeArtistRewardRate(newRate)
```
# Key Takeaway
Look at the bold part of the custom section. 

This contract is **not** upgradeable but all ownership can be transferred to a more advanced version

Any address with the `ADMIN` role can perform **any** type of function on **any** contract on the blockchain via the **custom** function














