# JTP Smart Contract
This code is the implementation of a smart contract for the JTP token on the Ethereum platform. The contract uses the Solidity programming language and is compatible with version 0.8.16 or later.

## Libraries
The contract is based on several external libraries, including:
- `Ownable`
- `Pausable`
- `ERC20`
- `IJTP`
  
The `Ownable` contract provides functionality for transfer of ownership of the contract, while the `Pausable` contract allows the contract owner to pause and unpause it. The ERC20 contract provides standard functionality for an `ERC20` token. The `IJTP` contract defines the interface for JTP token.

## Contract Properties
The contract includes a constructor that takes an address of the `FanToArtistStaking` contract and requires it to be non-zero. The address is stored as a private constant and is used to restrict the call of certain functions to only the `FanToArtistStaking` contract.

## Contract Functions
The contract implements the following functions:
- `transferOwnership`
- `mint`
- `burn`
- `burnFrom`
- `lock`
- `unlock`
- `payArtist`

### `transferOwnership`
This function allows the contract owner to transfer ownership of the contract to a new address.

### `mint`
This function allows the contract owner to mint new tokens and transfer them to a specified address.

### `burn`
This function allows the contract owner to burn tokens from their own account.

### `burnFrom`
This function allows the contract owner to burn tokens from a specified account.

### `lock`
This function allows tokens to be locked and can only be called by the `FanToArtistStaking` contract.

### `unlock`
This function allows tokens to be unlocked and can only be called by the `FanToArtistStaking` contract.

### `payArtist`
This function allows the `FanToArtistStaking` contract to pay artists and mint new tokens for them.

## Contract Restrictions
The locking and unlocking functions can only be called by the `FanToArtistStaking` contract, and the pay artist function can also only be called by the `FanToArtistStaking` contract.

Additionally, the contract uses a `whenNotPaused` modifier to restrict certain actions from being executed when the contract is paused.