## Functions

### lock

The lock calls the internal function `_transfer` (the same called by the public `transfer`) but with the target addresses reversed, so that the receiver is the caller of the function i.e. the contract `ArtistStaking`

```
_transfer(from, _msgSender(), amount);
```

Thus when a user makes a stake, he does not need to provide allowance to the ArtistStaking contract, which will hold the MusicProtocolRECORDToken tokens within it until the transfer, which will occur at stake maturity.

### pay

This function is used by one smart contract(ArtistStaking) and is intended to undermine an amount at a certain address.
