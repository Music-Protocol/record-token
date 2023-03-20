# FanToArtistStaking Contract
The `DEXLFactory` smart contract is based on the following **openzeppelin** standards:
- `Ownable` to restrict access to certain functions to the owner's address only
- `Initializable` to allow upgradeability
- `Math` to divide integers without precision loss
- `Clones` to allow upgradeability

## code snippets
### deployment
For the deployment of this smart contract if it has to be upgradeable, the proxy pattern must be followed. Otherwise, it can be deployed in the following way:
```
...
const factoryDEXLFactory = await ethers.getContractFactory('DEXLFactory');
const DEXLF = await factoryDEXLFactory.deploy() as DEXLFactory;
await DEXLF.deployed();
...
await DEXLF.initialize(fanToArtistStaking.address, pool.address, jtp.address, preferenceCooldown, DEXLRATE);
```
`preferenceCooldown` amount of second between a castPreference and another.
`pool.address` is the address of the implementation of the pool that will be deployed.
`DEXLRATE` must be between 0 and 10e8, it is the value correspondent to the rate of `defArtistReward` of the contract FanToArtistStaking. To fully understand how to set this value, look at the detailed file.

### DEXLRATE
The change of the reward rate can only be made by the current owner of the smart contract
**The value that is entered also takes effect retroactively but only for the period in which it was not claimed**
```
DEXLFactory.changeRewardRate(10e8)
```

### propose a DEXLPool
Anyone can propose a DEXLPool, but must first approve the transfer of the initialDeposit to the factory contract, which will hold it until approval or rejection.
```
await fundingTokenContract.connect(user0).approve(DEXLFactory.address, initialDeposit);
DEXLFactory.proposePool({
    fundingTokenContract    // address of ERC20 stable coin (SC)
    softCap,                // minimum SC to raise to start a pool
    hardCap,                // maximum SC that pool can collect
    initialDeposit,         // the amount of SC the 
    raiseEndDate,           // the seconds since deploy where the softCap needs to be reached
    terminationDate,        // the seconds since deploy where the Pool is no more active
    votingTime,             // the seconds representing the duration of the votes (same as proposalTime on DAO)
    leaderCommission,       // from 0 to 10e8 is the % of revenues that goes to leader
    couponAmount,           // from 0 to 10e8 is the % of revenues that goes to shareholders
    quorum,                 // from 0 to 10e8 same as DAO
    majority,               // from 0 to 10e8 same as DAO
    transferrable,          // true or false if shares are transferrable
    }, description          // optional description
)
```

### accepting a pool
In order to be able to accept a pool, one must be the owner of the contract, in which case a DEXLPool clone will be created and the initial deposit of the leader will be transferred to it, and ownership of the contract will pass to the address of the person who called the function.
```
DEXLFactory.approveProposal(index);
```

### decline of a pool
The rejection of a proposal is also granted to the proposal leader, who in the event of a block by the owner (which may be the DAO in the future) may decide to cancel the proposal and take back his initial deposit
```
DEXLFactory.declineProposal(index);
```

### casting preferences
Every user who has earned veJTP can express his preference for DEXLPools, all of which must be verified and still in operation at the time of nomination.
Preferences can be changed every preferenceCooldown seconds, **4** parameters must be specified:
an array of pools and an array with the respective percentages, which when added together must be equivalent to 10e8. And an array containing the previous pools and an array with the exact amount (not percentages) that was staked in the previous vote.
```
const receipt = await DEXLF.connect(users[0]).castPreference([pools[0].address], [10e8], [], []);
...
await DEXLF.connect(users[0]).castPreference([pools[1].address], [10e8], [pools[0].address], [amountVeJTPCasted]);
```

### get reward
this function (unlike FanToArtistStaking) can **only** be performed by a verified artist, 

The artist provides a list of **active** pools in which he has been nominated, and after checking that they are still valid, the proportion of votes will be taken according to the number of verified nominated artists. 
The number of jtp's multiplied by the seconds for which they have been staked is taken, this number is divided by the coefficient (DEXLRATE), and then will be multiplied by the votes (in proportion) received from the pools in which they are nominated, divided by the total votes.
```
DEXLFactory.connect(artists[0]).getReward([pools[0].address, pools[27].address]);
```
the artist will then receive the reward on his balance of the JTP contract