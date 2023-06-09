## Functions

### lock
The lock calls the internal function `_transfer` (the same called by the public `transfer`) but with the target addresses reversed, so that the receiver is the caller of the function i.e. the contract `fanToArtistStaking`
```
_transfer(from, _msgSender(), amount);
```
Thus when a user makes a stake, he does not need to provide allowance to the fanToArtistStaking contract, which will hold the JTP tokens within it until the transfer, which will occur at stake maturity.

### pay
This function is used by two smart contracts(FanToArtistStaking, DEXLFactory) and is intended to undermine an amount at a certain address.