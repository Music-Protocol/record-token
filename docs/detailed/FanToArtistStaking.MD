### Timestamps
In this as in other contracts `uint40` is used to represent dates 35k years in the future, uint32 could also be used but 2^32 as a unix timestamp is February 7, 2106.
### Stakes
Stakes are characterized by a start date, an end date, a Web3MusicNativeToken amount and a boolean to indicate whether tokens have been withdrawn.
![image](./../data/_stake%20mapping.png)

### Artist Reward in phases
Rhe reward for artists is characterized by a beginning and an end. in the image (where the background color represents a different rate) it means that at instant 11 and 15 the function to change the rate was called. a rate once entered cannot be changed because it cannot be changed retroactively
![image](./../data/reward%20phase.png)
In this representation the blue reward will comprise stake s1 from instant 5 to 11 and s2 from 8 to 11;
the red reward will include the s1 stake from 11 to 12, s2 from 11 to 14, s3 from 13 to 15 and s4 from 14 to 15;
the green one will include s3 from 15 to 18 and s4 from 15 to 24.

Rewards even if entered by mistake with too high a rate can never be deleted completely, only interrupted by entering a new rate.
Let's take an example. If Alice stakes 100 Web3MusicNativeToken towards the verified artist Bob for 100 seconds and the reward rate remains 1 from the beginning to the end of the stake Bob will be able to claim 10000 Web3MusicNativeToken (amount * time / )(100 x 100 /1) most likely the rate will have to be a very high number. It corresponds to asking "How many seconds does it take for 1 Web3MusicNativeToken staked to generate 1 Web3MusicNativeToken of reward for the artist?"
#### Ve rate
The same equation applies to voting power, but as it is not modifiable there are no phased mechanisms and that you earn immediately the amount

### verified artist list
Since in some cases there is a need to loop on every artist staked, we decided to keep a redundancy array for the artists. In order to prevent an artist from being double-posted on the array (double-push since you don't pop) the classic mapping(address => bool) became mapping(address => uin8)
where 0 indicates never added, 1 indicates added and 2 removed
When adding: if it is 0 it will become 1 and the push will be done, if it is 2 it will just become 1 without push
When removing from 1 it always becomes 2
