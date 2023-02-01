# JTP Management Contract

This contract manages the JTP token and the Fan-to-Artist Staking Contract.

## Imports
- `@openzeppelin/contracts/access/AccessControl.sol` for role-based access control
- `IJTP.sol` for JTP token functionality
- `IFanToArtistStaking.sol` for Fan-to-Artist Staking functionality

## Roles
- `MINTER_ROLE` for minting tokens
- `BURNER_ROLE` for burning tokens
- `VERIFY_ARTIST_ROLE` for adding and removing artists in the Fan-to-Artist Staking Contract

## Variables
- `_jtp` reference to the JTP token contract
- `_ftas` reference to the Fan-to-Artist Staking Contract

## Events
- `Mint` triggered when tokens are minted
- `Burn` triggered when tokens are burned

## Constructor
- Initializes the JTP and Fan-to-Artist Staking contracts
- Grants the minter, burner, and verify artist roles to the contract's deployer

## Functions

### Minting
- `mint` allows a contract with `MINTER_ROLE` to mint tokens for a specific address

### Burning
- `burn` allows a contract with `BURNER_ROLE` to burn tokens from the contract's own balance
- `burnFrom` allows a contract with `BURNER_ROLE` to burn tokens from a specific address

### Contract Management
- `transferJTP` allows a contract with `DEFAULT_ADMIN_ROLE` to transfer ownership of the JTP contract
- `transferFanToArtistStaking` allows a contract with `DEFAULT_ADMIN_ROLE` to transfer ownership of the Fan-to-Artist Staking Contract
- `addArtist` allows a contract with `VERIFY_ARTIST_ROLE` to add an artist to the list of verified artists in the Fan-to-Artist Staking Contract
- `removeArtist` allows a contract with `VERIFY_ARTIST_ROLE` to remove an artist from the list of verified artists in the Fan-to-Artist Staking Contract
- `pauseJTP` allows a contract with `DEFAULT_ADMIN_ROLE` to pause the JTP contract
- `unpauseJTP` allows a contract with `DEFAULT_ADMIN_ROLE` to unpause the JTP contract
