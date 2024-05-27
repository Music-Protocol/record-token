# MusicProtocolDAO Smart Contract

The `MusicProtocolDAO` smart contract is based on the following **openzeppelin** standard:

-   `Address` to check the result of call on other smart contracts

## Contract Properties

Note that this contract is initialized via the constructor and is therefore **not** updatable. Differently the management contract, in order to be able to transfer ownership to a DAOv2 of the smart contracts it has acquired, an affirmative vote will be required

## code snippets

### deployment

In order to deploy correctly this smart contract the following smart contracts must already be deployed in order to pass their addresses. (**ArtistStaking** and consequently **MusicProtocolRECORDToken**)

```
const cDAO = await ethers.getContractFactory('MusicProtocolDAO');
dao = await cDAO.deploy(ArtistStaking.address, quorum, majority, proposalTime);
await dao.deployed();
```

the first of the 4 parameters is quite intuitable.
the `quorum` must be a number between 0 and 10e8, where 10e8 represents 100%, the same applies to the `majority`. **Beware that if the DAO starts to lose popularity to the extent that the number of active users with voting power is less than a quorum, no vote will pass**
The `proposalTime` is the number of seconds it takes to vote on a proposal, e.g. to have 10 days ProposalTime should be: 864000

### propose

Proposals can be made by specifying a list of targets and the corresponding calldatas and a description with the intent of the proposal, unless the same combination is already present and the vote is completed successfully. In which case it will be necessary to execute the proposal and then create the proposal to be voted on later. If the proposal already present is still being voted on, it will be necessary to wait for the outcome to formulate an identical one. Although it would be enough to change the description to put it immediately to the votes.

```
const calldata = web3.eth.abi.encodeFunctionCall({
    name: 'mint',
    type: 'function',
    inputs: [{
        type: 'address',
        name: 'to'
    }, {
        type: 'uint256',
        name: 'amount'
    }]
}, [owner.address, `1000`]);
dao.propose([MusicProtocolRECORDToken.address], [calldata], "Gift previous owner");
//or
dao.propose([], [], "should we only sell rock songs?");
```

### votes

You can vote **for** or **against** any active proposal. The weight of your vote is determined by how many MusicProtocolRECORDToken and how long you staked them, meaning your **VeMusicProtocolRECORDToken**s. In the voting process, targets must be specified along with their calldata and description.

```
dao.vote([MusicProtocolRECORDToken.address], [calldata], "Gift previous owner", true);  // for
dao.vote([MusicProtocolRECORDToken.address], [calldata], "Gift previous owner", false); // against
```

### execution

On all proposals that have passed the end of the voting period the **execute** can be called but **only** those that reached quorum and passed the majority will actually be executed and then the memory slot dedicated to the proposal will be freed up.

```
dao.execute([MusicProtocolRECORDToken.address], [calldata], "Gift previous owner");
```
