# MusicProtocolRECORDTokenManagement Smart Contract

The `MusicProtocolRECORDTokenManagement` smart contract is based on the following **openzeppelin** standards:

-   `AccessControl` to restrict the access of some resources to a bucket of addresses
-   `Address` to check the result of call on other smart contracts

### Roles

There are 4 roles in addition to the default admin role:

-   `MINTER` and `BURNER` for the respective functions of MusicProtocolRECORDToken
-   `VERIFY_ARTIST` to add/remove verified artists

## Contract Properties

Note that this contract is initialized via the constructor and is therefore **not** updatable. However, contract ownership can be transferred to a new version or to the DAO

## code snippets

### deployment

In order to deploy correctly this smart contract the following smart contracts must already be deployed in order to pass their addresses. (**MusicProtocolRECORDToken**, **ArtistStaking**)

```
...
const managementFactory = await ethers.getContractFactory("MusicProtocolRECORDTokenManagement");
const MusicProtocolRECORDTokenManagement = await managementFactory.deploy(MusicProtocolRECORDToken.address, ArtistStaking.address);
await MusicProtocolRECORDTokenManagement.deployed()
...
await MusicProtocolRECORDToken.transferOwnership(MusicProtocolRECORDTokenManagement.address);
await ArtistStaking.transferOwnership(MusicProtocolRECORDTokenManagement.address);
```

### Roles

#### grant a role

```
burnerRole = await MusicProtocolRECORDTokenManagement.BURNER_ROLE();
MusicProtocolRECORDTokenManagement.grantRole(burnerRole, addr1.address);
```

#### check if someone has a role

```
burnerRole = await MusicProtocolRECORDTokenManagement.BURNER_ROLE();
MusicProtocolRECORDTokenManagement.hasRole(burnerRole, addr1.address)
```

#### revoke a role

```
burnerRole = await MusicProtocolRECORDTokenManagement.BURNER_ROLE();
MusicProtocolRECORDTokenManagement.revokeRole(burnerRole, addr1.address);
```

### mint and burn

The corresponding roles are required and obviously the management contract must be the owner of the contract called, `MusicProtocolRECORDToken` in this case

```
MusicProtocolRECORDTokenManagement.mint(addr1.address, 10)

MusicProtocolRECORDTokenManagement.burn(10)


MusicProtocolRECORDToken.connect(addr1).approve(MusicProtocolRECORDTokenManagement.address, 10)
MusicProtocolRECORDTokenManagement.burnFrom(addr1.address, 10)
```

### add and remove of artist

Obviously in order to add and remove artists the management contract must be the owner of the contract called, `ArtistStaking` in this case, and the caller must have the role `VERIFY_ARTIST_ROLE`

```
MusicProtocolRECORDTokenManagement.addArtist(artist1.address)
MusicProtocolRECORDTokenManagement.removeArtist(artist1.address)
```

```
MusicProtocolRECORDTokenManagement.approveProposal(proposalHash)
MusicProtocolRECORDTokenManagement.declineProposal(proposalHash)
```

### change reward rate

To be able to change reward rates you need to have the `ADMIN` role and the management has to be the owner of the contracts called (`ArtistStaking`)
Look at the respective documents (also detailed) to understand how to set the reward rate to achieve the desired result.

```
MusicProtocolRECORDTokenManagement.changeArtistRewardRate(newRate)
```

# Key Takeaway

Look at the bold part of the custom section.

This contract is **not** upgradeable but all ownership can be transferred to a more advanced version

Any address with the `ADMIN` role can perform **any** type of function on **any** contract on the blockchain via the **custom** function
