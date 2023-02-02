# FanToArtistStaking Contract
This contract is an implementation of the IFanToArtistStaking interface, and is also Ownable, meaning it has an owner with special privileges.

The contract manages fan-to-artist staking, including adding and removing artists, and tracking staking information such as the amount staked, start and end times, and whether the stake has been redeemed. The contract also keeps track of rewards for artists, including reward rates and the start and end times for each reward period.

## Imports
- The `Ownable` contract from the OpenZeppelin access library is imported to provide ownership-related functionality.
- The `IJTP` interface is imported to interact with the JTP contract.
- The `IFanToArtistStaking` interface is imported for contract compliance.
## Structs
- The `Stake` struct tracks information about individual stakes made by fans to artists, including the amount staked, start and end times, and whether the stake has been redeemed.
- The `DetailedStake` struct extends the Stake struct by also tracking the artist and user associated with the stake.
- The `ArtistReward` struct tracks information about rewards for artists, including the start and end times for each reward period and the reward rate.
## Mappings
- The `_stake` mapping tracks all stakes made by fans to artists, using the artist's address as the first key and the fan's address as the second key, to store an array of `Stake` structs.
- The `_artistStaked` mapping tracks all artists staked by each fan, using the fan's address as the key to store an array of artist addresses.
- The `_stakerOfArtist` mapping tracks all fans who have staked each artist, using the artist's address as the key to store an array of fan addresses.
- The `_verifiedArtists` mapping keeps track of which artists have been verified, using the artist's address as the key and a boolean value indicating whether they have been verified or not.
- The `_artistAlreadyPaid` mapping tracks how much each artist has already been paid, using the artist's address as the key and the amount paid as the value.
## Variables
- `_jtp` is a private variable to store the instance of the JTP contract.
- `_artistReward` is a private array to store all ArtistReward structs.
- `_verifiedArtistsArr` is a private array to store the addresses of all verified artists.
- `_veJTPRewardRate` is a private constant to store the rate of rewards for VE in JTP tokens.
- `_minStakePeriod` is a private constant to store the minimum period of time that a fan can stake for.
- `_maxStakePeriod` is a private constant to store the maximum period of time that a fan can stake for.

## Events
- `ArtistAdded`: fired when a new artist is added to the contract. It includes the following indexed parameters:
    - `artist`: the address of the newly added artist
    - `sender`: the address of the user who added the artist
  
- `ArtistRemoved`: fired when an artist is removed from the contract. It includes the following indexed parameters:
   - `artist`: the address of the removed artist
   - `sender`: the address of the user who removed the artist

- `ArtistPaid`: fired when an artist is paid by the contract. It includes the following indexed parameters:
  - `artist`: the address of the artist who received the payment
  - `amount`: the amount of payment received by the artist

- `ArtistJTPRewardChanged`: fired when the JTP reward for artists is changed. It includes the following indexed parameters:
  - `newRate`: the new JTP reward rate for artists
  - `timestamp`: the timestamp of the change
  - `sender`: the address of the user who made the change

- `StakeCreated`: fired when a stake is created in the contract. It includes the following indexed parameters:
  - `artist`: the address of the artist that the stake is made for
  - `sender`: the address of the user who created the stake
  - `amount`: the amount of the stake
  - `end`: the end time of the stake

- `StakeEndChanged`: fired when the end time of a stake is changed. It includes the following indexed parameters:
  - `artist`: the address of the artist that the stake is made for
  - `sender`: the address of the user who changed the end time of the stake
  - `end`: the original end time of the stake
  - `newEnd`: the new end time of the stake

- `StakeRedeemed`: fired when a stake is redeemed. It includes the following indexed parameters:
  - `artist`: the address of the artist that the stake is made for
  - `sender`: the address of the user who redeemed the stake
  - `end`: the end time of the redeemed stake.