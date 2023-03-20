![image](./../data/pool%20votes.png)
In the image there is a representation of how the redistribution of the reward rate occurs, but for simplicity I also show an example.

Let "s assume that we are in the simplest possible case. One in which the redemption of the reward is taking place at a time when there has been a single stake of 100JTP for 100 seconds, 
With a DEXLRATE of 200, meaning that for every jtp per second it takes 200 seconds to generate 1 jtp of reward.
Suppose there are only 2 pools, pool1 which has received 75veJTP of preferences and pool2 with 25veJTP of preferences. Both pools nominated the same two artists but one of them was removed from the list of verified artists. And pool2 has passed its activity phase so it cannot be included in the reward list.
![image](./../data/dexrate%20example.png)
We therefore have that JTPtoRedistribute equals 50 and that the only pool the artist can indicate is the only active one in which he is nominated, i.e. pool1, which among the nominated artists has only one verified at the time of the call and therefore all votes in pool1 will benefit him. 

Unfortunately, it will also not be able to claim the part of the reward that is allocated to pool2 because it is out of activity, this system is optimal in an active environment where preferences are updated more frequently than pools end their activity period.

Doing the calculations in this example, the artist is entitled to 75% of the JTP put in reward which equals 37.5 but due to rounding will receive 37 JTP