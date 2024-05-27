# MusicProtocolRECORDToken Smart Contract

The `MusicProtocolRECORDToken` smart contract is based on the following **openzeppelin** standards:

-   `Pausable` to give the possibility to interrupt operations
-   `Ownable` to restrict access of certain functions to the owner's address only
-   `ERC20` to implement the functions of the fungible token

There is also an `IMusicProtocolRECORDToken` interface that allows other smart contracts to communicate with the additional functions of MusicProtocolRECORDToken

## Contract Properties

The contract is initialized with a constructor and not with a pattern function Initializable so it will **not** be possible to deploy via proxy and will not be updatable.

## code snippets

### deployment

In order to deploy correctly this smart contract the following smart contracts must already be deployed in order to pass their addresses. (**ArtistStaking**)

```
...
const MusicProtocolRECORDTokenFactory = await ethers.getContractFactory('MusicProtocolRECORDToken');
MusicProtocolRECORDToken = await MusicProtocolRECORDTokenFactory.deploy(ArtistStaking.address);
await MusicProtocolRECORDToken.deployed();
...
await MusicProtocolRECORDToken.transferOwnership(MusicProtocolRECORDTokenManagement.address);

```

### mint and burn

These three functions are restricted only to the address of the current contract owner this means that only one smart contract will always be able to call the functions (Management **OR** DAO).
(note that **burn** destroys the tokens of the address calling the MusicProtocolRECORDToken contract, and that to use **burnFrom** the target address will have to provide the allowance for the amount to be burned to the address that will call burnFrom)

```
await MusicProtocolRECORDToken.mint(targetAddress, 10e18);
OR
await MusicProtocolRECORDToken.burn(10e18);
OR
await MusicProtocolRECORDToken.burnFrom(targetAddress, 10e18);
```

### lock

The `lock` function is restricted to the use of only the address of the `ArtistStaking` contract, which, being immutable, can never be changed, guaranteeing that the smart contract is secure.

### pay

<!-- this function has the same kind of restriction that the lock function has but also for another address REMOVE PAY FUNCTION? -->

# Key Takeaway

The contract as it is now will not be able to be proxy upgraded, and the contract to which it is linked (ArtistStaking) can never be changed.
