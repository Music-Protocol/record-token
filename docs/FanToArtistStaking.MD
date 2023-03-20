# FanToArtistStaking Contract
The `FanToArtistStaking` smart contract is based on the following **openzeppelin** standards:
- `Ownable` to restrict access to certain functions to the owner's address only
- `Initializable` to allow upgradeability

There are also two interfaces one is `IJTP` to communicate with the `JTP` contract and one `IFanToArtistStaking` to allow other contracts to call the current one

## Contract Properties
Choices on implementations can be found in the detailed file

## code snippets
### deployment
For the deployment of this smart contract if it has to be upgradeable, the proxy pattern must be followed. Otherwise, it can be deployed in the following way:
```
...
const FTAS = await ethers.getContractFactory('FanToArtistStaking');
const fanToArtistStaking = await FTAS.deploy();
await fanToArtistStaking.deployed();
...
await fanToArtistStaking.initialize(jtp.address, defVeReward, defArtistReward, minStakeTime, maxStakeTime);
```
`minStakeTime` and `maxStakeTime` represent the minimum and maximum time to make a stake and can never be changed in this implementation.
`jtp.address` is the address of the JTP smart contract that is to implement the IJTP interface.
`defVeReward` and `defArtistReward` are respectively used to calculate the voting power and reward of artists, this number corresponds to x where amountJTP * time / x. can it be read as: "every how many seconds a jtp is staked corresponds to a token in the output?"
Note that only the artist's reward can be changed over time and the new value is not retroactive but a phased mechanism is used which is described in the detailed documentation.


### User and Artist Stake retrieval
returns users who call the function to see the stakes they have made
```
fanToArtistStaking.connect(users[0]).getAllUserStake();
```
returns to artists the stakes made by users towards them
```
fanToArtistStaking.connect(artists[0]).getAllArtistStake();
```

### Artist get reward
Can only be called by verified artists and calculates the number of tokens the artist will receive based on the tokens staked towards them multiplied by seconds and divided by the artistRewardRate that was present at the time of each stake.
```
fanToArtistStaking.connect(artists[0]).getReward()
```

### add and remove of an artist
An artist must be added to the verified artists list in order to receive stakes and rewards.
These two functions can only be called by the owner of this contract, i.e. by the management initially and later by the DAO if this contract is transferred.
When an artist is removed, all present stakeholders suffer an early end.
```
fanToArtistStaking.addArtist(artist1.address, sender.address)
&&&
fanToArtistStaking.removeArtist(artist1.address, addr1.address)
```
note that these functions should not be called directly from this contract but from the one that owns them
TODO explain the uint8 thing

### change of the artist reward rate
Just as with artist management, this function can only be called by the owner of the contract. The newly entered rate takes effect from the current time.
```
fanToArtistStaking.changeArtistRewardRate(rate, sender.address)
```
### stake
In order to make a stake, it is necessary to have the enough tokens in the JTP contract, that the stake period is between min and max, that there are no other stakes towards the same artist already active
```
fanToArtistStaking.connect(users[0]).stake(artist.address, amount, time)
```
In this example user0 is staking for time seconds and amount tokens that will be transferred from his jtp balance to that of fanToArtistStaking

### increase a stake
A user can decide to increase the tokens staked, and in order to do so the stake must still be ongoing, so we also know that the tokens have not been redeemed and that the artist is still verified
```
fanToArtistStaking.increaseAmountStaked(artist.address, amountToAdd);
```
what happens underneath is that the current stake is stopped and a new one is created

### extend a stake
A user can decide to increase the tokens staked, and in order to do so the stake must still be ongoing, so we also know that the tokens have not been redeemed and that the artist is still verified
```
fanToArtistStaking.increaseAmountStaked(artist.address, amountToAdd);
```
what happens underneath is that the current stake is stopped and a new one is created

### change staked artist
A user may change a stake as long as it is not yet finished and the new artist is verified. The stake on the first artist is stopped and a new stake is created on newArtist 
```
fanToArtistStaking.changeArtistStaked(users[0].address, artists[1].address)
```

### redeem a stake
A user is only entitled to take back tokens staked at the moment the stake reaches its end. (once at most, obviously)
```
fanToArtistStaking.redeem(artists[0].address, endTime)
//endTime = timestamp in seconds of the endTime of the stake you want to redeem
```


### voting power
There are 4 functions: `totalVotingPowerAt` `totalVotingPower`, `votingPowerOfAt` and `votingPowerOf` 
as can be seen from the names, those ending with At calculate the voting power up to the timestamp passed in the parameters, those with of calculate only those of an artist. All these functions support the DAO contract for votes.
```
fanToArtistStaking.totalVotingPower()
fanToArtistStaking.totalVotingPowerAt(dateInSec)
fanToArtistStaking.votingPowerOf(user0.address)
fanToArtistStaking.votingPowerOfAt(user0.address, dateInSec)
```
Returns an integer representing the amount staked multiplied by seconds and divided by the veJTPRate

### dexlreward
calculateOverallStake is another support function but for the Factory contract that deals with redistributing the DEXLReward. this function returns the number of tokens staked multiplied by the seconds of each user to each artist
```
 fanToArtistStaking.calculateOverallStake(timestamp.min, timestamp.max)
```

# key takeaways
Keep in mind that although it is possible to upgrade, it is not possible to change the structure of the existing data, and consequently not all new functions can be integrated.