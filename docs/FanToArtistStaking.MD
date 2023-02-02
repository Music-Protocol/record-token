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
- `ArtistAdded`: triggered when a new artist is added to the contract.
  - `artist`: The address of the artist added to the contract.
  - `sender`: The address of the user who added the artist.

- `ArtistRemoved`: triggered when an artist is removed from the contract.
  - `artist`: The address of the artist removed from the contract.
  - `sender`: The address of the user who removed the artist.
- `ArtistPaid`: triggered when an artist is paid.
  - `artist`: The address of the artist who is paid.
  - `amount`: The amount paid to the artist.
- `ArtistJTPRewardChanged`: triggered when the JTP reward rate for an artist is changed.
  - `newRate`: The new JTP reward rate for the artist.
  - `timestamp`: The timestamp of the change.
  - `sender`: The address of the user who changed the JTP reward rate.
- `StakeCreated`: triggered when a stake is created for an artist.
  - `artist`: The address of the artist the stake is created for.
  - `sender`: The address of the user who created the stake.
  - `amount`: The amount of the stake.
  - `end`: The end date of the stake.
- `StakeEndChanged`: triggered when the end date of a stake is changed.
  - `artist`: The address of the artist the stake belongs to.
  - `sender`: The address of the user who changed the end date.
  - `end`: The original end date of the stake.
  - `newEnd`: The new end date of the stake.
- `StakeRedeemed`: triggered when a stake is redeemed.
  - `artist`: The address of the artist the stake belongs to.
  - `sender`: The address of the user who redeemed the stake.
  - `end`: The end date of the redeemed stake.

## Constructor
It takes four arguments: 
- `veJTPRewardRate`: This is the reward rate for the voting power for each JTP token staked in the contract. 
- `artistJTPRewardRate`: This is the reward rate for each artist for each JTP token staked in the contract.
- `min`: This is the minimum staking period in seconds.
- `max`: This is the maximum staking period in seconds.

The constructor sets the values of `_veJTPRewardRate`, `_artistReward`, `_minStakePeriod`, and `_maxStakePeriod` to the values of the arguments passed. The `_artistReward` struct is initialized with the start, end, and rate equal to 0, 0, and `artistJTPRewardRate` respectively.
After the deploy it is supposed to link the `JTP` contract through the `setJTP` function

## Modifiers
### `onlyNotEnded`
This is a modifier that requires the passed `end` argument to be greater than the current block's timestamp. It will throw an error message if the `end` is less than or equal to the current block's timestamp.

### `onlyEnded`
This is a modifier that requires the passed `end` argument to be less than the current block's timestamp. It will throw an error message if the `end` is greater than or equal to the current block's timestamp.

## Contract Functions
### `setJTP`
This function sets the `_jtp` address to the passed argument `jtp`. The function can only be called by the contract owner and requires that the `_jtp` address is not set before.

### `transferOwnership`
This function transfers the ownership of the contract to the `to` address. It can only be called by the contract owner.

### **`getAllStake`**
This function returns an array of all the stakes made by the message sender.
#### **Inputs**
None.
#### **Outputs**
`DetailedStake`[]: an array of all the stakes made by the message sender, represented as DetailedStake structs.
#### **Behaviour** 
The function first calculates the total number of stakes made by the message sender by looping through the `_artistStaked` mapping for the message sender and counting the number of stakes for each artist. Then, an array of `DetailedStake` structs is created with the calculated size. The function loops through the `_artistStaked` mapping again and for each artist, loops through the `_stake` mapping for the artist and message sender and adds each stake to the `DetailedStake` array, along with the artist and message sender addresses. Finally, the `DetailedStake` array is returned.

### **`getAllArtistStake`**
This function returns an array of all the stakes made for the message sender as an artist.
#### **Inputs**
None.
#### **Outputs**
`DetailedStake`[]: an array of all the stakes made for the message sender as an artist, represented as `DetailedStake` structs.
#### **Behaviour** 
The function first calculates the total number of stakes made for the message sender by looping through the `_stakerOfArtist`

### **`getReward`**
This function is used to calculate and distribute the rewards for an artist based on the stakes made by their fans.
#### **Input**
- None
#### **Pre-conditions**
- The calling user must be a registered artist in the system.
- The artist must have at least one stake from a fan in the system.
- The calling user must have at least one stake made by their fans in the system.
#### **Output**
- `ArtistPaid` event is emitted with the artist's address and the amount of reward paid to the artist.
#### **Actions performed**:
- It retrieves the list of fans that have staked the artist.
- A variable `accumulator` is initialized to 0.
- For each fan, the function loops through the stakes made by that fan to the artist and calculates the rewards based on the staking rate and period. The calculation is performed as follows:
  - The reward amount is calculated as the product of the staking amount, the duration of the stake (in seconds), and the rate of rewards.
  - The duration of the stake is calculated as the minimum of the end of the stake and the current block timestamp.
  - The calculation is performed for each reward period defined for the artist, and the rewards are accumulated in the `accumulator` variable.
- The function subtracts the amount already paid to the artist from the `accumulator`.
- The calculated reward amount is then paid to the artist using the `payArtist` function of the `_jtp` contract.
- The `ArtistPaid` event is emitted with the artist's address and the amount of reward paid to the artist.
- The amount already paid to the artist is updated in the `_artistAlreadyPaid` mapping.

### **`addArtist`**
Adds an artist to the list of verified artists.
#### **Input**
- `artist`: Address of the artist to be added.
- `sender`: Address of the person who is adding the artist.
#### **Output**
- `ArtistAdded`: Event is fired with the following parameters
- `artist`: Address of the added artist.
- `sender`: Address of the person who added the artist.
#### **Behaviour**
If the artist is not verified, the function sets the verification status to true and adds the artist to the list of verified artists.
An `ArtistAdded` event is fired with the given artist and sender parameters.
#### **Preconditions**
- The caller of the function must be the contract owner.
- The given artist is not already verified.

### **`removeArtist`**
Removes an artist from the list of verified artists.
#### **Input**
- `artist`: Address of the artist to be removed.
- `sender`: Address of the person who is removing the artist.
#### **Output**
- `ArtistRemoved`: Event is fired with the following parameters
- `StakeEndChanged`: Event is fired for each active stake to the removed artist
- `artist`: Address of the removed artist.
- `sender`: Address of the person who removed the artist.
#### **Behaviour**
If the artist is verified, the function sets the verification status to false and ends all the stakes associated with the artist.
An ArtistRemoved event is fired with the given artist and sender parameters.
#### **Preconditions**
- The caller of the function must be the contract owner.
- The given artist is verified.

### **`changeArtistRewardRate`**
#### **Input**
- `rate`: uint128, the new reward rate for the artist
- `sender`: address, the address of the sender
#### **Behaviour**
This function changes the reward rate for the artists. It sets the end time for the previous reward rate and adds a new reward rate with the given rate and the current timestamp as the start time. It emits the ArtistJTPRewardChanged event with the new rate, the current timestamp and the sender's address.
#### **Pre-Conditions**
The caller must be the contract owner
#### **Output**
- `ArtistJTPRewardChanged` event is emitted

### **`getStakingVeRate`**
#### **Behaviour**
This function returns the current rate of JTP reward for staking.
#### **Output**
uint128, the current JTP reward rate for staking

### **`getArtistRewardRate`**
#### **Behaviour**
This function returns the current reward rate for the artists. It retrieves the rate of the most recent artist reward rate.
#### **Output**
uint256, the current artist reward rate

### **`stake`**
#### **Input**
- `artist`: address, the address of the artist to stake JTP for
- `amount`: uint256, the amount of JTP to stake
- `end`: uint128, the end time for the stake period
#### **Behaviour**
This function allows a verified artist to stake JTP for another artist. If all checks pass, the function locks the given amount of JTP from the caller's account and adds the stake to the contract's internal state. It emits the StakeCreated event with the artist's address, the caller's address, the amount of JTP staked and the end time for the stake period.
#### **Pre-Conditions**
The caller must be a verified artist
The end time must be greater than the minimum stake period and less than the maximum stake period
The caller must not be staking for the same artist at the moment
#### **Output**
- `StakeCreated` event is emitted

### **`increaseAmountStaked`**
#### **Input**
- `artist`: address, the address of the artist to stake JTP for
- `amount`: uint256, the amount of JTP to stake
- `end`: uint128, the end time for the stake period
#### **Behaviour**
This function allows the caller to increase the amount of JTP staked for a particular artist. It first finds the index of the stake with the given end time. If no such stake is found, it reverts the transaction. If the stake is found, the function locks the given amount of JTP from the caller's account, sets the redeemed status of the previous stake to true, updates the end time of the stake to the current timestamp, adds the increased amount of JTP to the new stake and emits several events to reflect the changes in the contract's internal state.
#### **Pre-Conditions**
The caller must be a verified artist
The end time of the stake must not have ended
#### **Output**
- `StakeEndChanged` event is emitted
- `StakeRedeemed` event is emitted
- `StakeCreated` event is emitted
