# PublicPressureDAO Smart Contract
The `DEXLPool` smart contract is based on the following **openzeppelin** standard:
- `ERC4626Upgradeable` 
- `OwnableUpgradeable` to takeover the pool by the leader
- `Address` to check the result of call on other smart contracts
- `Math` to multiply and divide reducing the loss

## Contract Properties
This contract is a stencil used by the `DEXLFactory` to create `DEXLPool` **clones** making deployment lighter.

A pool has the following three phases:
![image](./data/pool%20activity.png)


## code snippets
### deployment
the deployment of the `DEXLPool` smart contract must take place before the deployment of the `DEXLFactory`
```
const poolF = await ethers.getContractFactory('DEXLPool');
let pool = await poolF.deploy() as DEXLPool;
await pool.deployed();  
```
### initialization
the initialization of this contract takes place via the DEXLFactory with the parameters passed in the proposals, but to represent and clarify here is how the process happens.
```
await stableCoin.connect(leader).approve(pool.address, initialDeposit);
pool.initialize({
    leader,                 // address of the pool leader
    fundingTokenContract,   // address of ERC20 stable coin (SC)
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
}, 
    addressOfOwner,         // address of the owner
    fanToArtistStaking.address
    )
```


### take over
This action can only be performed by the contract owner and can set a new leader. Note that in this **only** the "ROLE" is transferred, **not** the shares in his possession. only in the case of revenue will the leader commission go to the new leader.
(in order to take out the stable coins of the leader as well, it will be necessary to propose financing to an address and if it passes manage the case off chain)
```
pool.setLeader(manager.address);
```

### take over
This action can only be performed by the contract owner and can set a new leader. Note that in this **only** the "ROLE" is transferred, **not** the shares in his possession. only in the case of revenue will the leader commission go to the new leader.
(in order to take out the stable coins of the leader as well, it will be necessary to propose financing to an address and if it passes manage the case off chain)
```
pool.setLeader(manager.address);
```

### deposit
In the **raise found** phase, it is only possible to call the deposit to lock assets in exchange for shares. You can only deposit before the raise end date as long as you do not exceed the hardCap of assets.
```
await stableCoin.approve(pool.address, depositAmount);
pool.deposit(depositAmount, beneficiaryAddress);
```

### withdraw and redeem
Let's start with the **withdraw**, it has been overwritten to work only in the event that the pool does not reach the activity phase, which only happens when the raiseEndDate is exceeded and the collected assets are less than softCap
```
pool.connect(u).withdraw(
    amountToWithdraw,
    u.address,  // receiver
    u.address   // owner (if different from caller needs allowance)
);
```
now on to the case of the redeem, it is only available when the pool reaches the termination date there is no difference from the withdraw so even if someone waits until the termination date there is no difference. Attention must be paid to the fact that if there are redistributions of revenue after the redeem
```
pool.connect(u).redeem(
    numberOfShares,
    u.address,  // receiver
    u.address   // owner (if different from caller needs allowance)
);
```

### proposals
There are 3 different types of proposals and all of them can only be made in an active pool (which is in the active period and must have collected deposits of at least softCap).
Let's start with the founding proposal, which can only be made by the pool leader (who may also not own shares if he has transferred them). Founding can be made to any address and also of assets that the pool doesnt own at the time of the proposal but will have to be present at the time of execution.
```
pool.connect(leader).proposeFounding(
    artist.address,
    amountAsset,  // amount of the stable coin
    description   // text containing the reason of the founding
);
```
For the other proposal types, you need to be a shareholder, it is about the early closure of the pool and referendums (only description but nothing will be executed). 
```
pool.connect(shareholders[2]).proposeReferendum(
    description   // text containing the proposal
);
```
```
pool.connect(shareholders[2]).proposeEarlyClosure(
    description   // text containing the reason of why the should be closed earlier
);
```

### voting on a proposal
When a proposal is made, a corresponding id is created, and every shareholder can cast a maximum of one vote per proposal, for or against, before the end of the voting period.
```
pool.connect(shareholders[2]).voteProposal(
    index,
    choice   // a boolean -> true = FOR | false = AGAINST
);
```

### execution of a proposal
Execution (such as voting and proposal) must take place during the pool's activity period. Can be performed by anyone even by those who do not possess shares.
Any proposal that has passed the end of the voting period, with a total amount of votes exceeding the quorum and affirmative votes exceeding the majority percentage can be executed.
A referendum-type proposal can also be executed, but no operation will be performed.
```
pool.connect(shareholders[2]).executeProposal(
    index
);
```

### artist nomination
The nomination of artists is only done by the leader during a pool's activity period. An artist may be nominated a maximum of one time and must be verified at the time of nomination but not at the time of removal.
```
pool.addArtist(artist.address)
```
```
pool.removeArtist(artist.address)
```

### transferability
If the transfer mechanism is permitted then so is the allowance, and it is possible to perform these operations at any stage of the pool.