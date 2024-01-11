import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { FanToArtistStaking, Web3MusicNativeToken } from '../typechain-types/index';
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import { timeMachine } from './utils/utils';

describe("FanToArtistStaking2", function () {
    
    async function deployF2A() {
        const [owner, addr1, addr2, addr3, artist1, artist2, artist3] = await ethers.getSigners();
        const defArtistReward = 10;
        const amount = 10n*10n**18n;
        const FTAS = await ethers.getContractFactory('FanToArtistStaking');
        const fanToArtistStaking = await FTAS.deploy() as FanToArtistStaking;
        await fanToArtistStaking.deployed();

        const cWeb3MusicNativeToken = await ethers.getContractFactory('Web3MusicNativeToken');
        const Web3MusicNativeToken = await cWeb3MusicNativeToken.deploy(fanToArtistStaking.address) as Web3MusicNativeToken;
        await Web3MusicNativeToken.deployed();
        await fanToArtistStaking.initialize(Web3MusicNativeToken.address, defArtistReward, 10, 86400, 3, 10);

        await Web3MusicNativeToken.connect(owner).mint(addr1.address, amount);

        await fanToArtistStaking.addArtist(artist1.address, owner.address);
        await fanToArtistStaking.addArtist(artist2.address, owner.address);
        await fanToArtistStaking.addArtist(artist3.address, owner.address);

        return { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, addr2, addr3, artist1, artist2, artist3, amount}
    }

    it('Owner should be able to change artist reward limit', async () => {
        const { fanToArtistStaking, owner } = await loadFixture(deployF2A);
        expect(await fanToArtistStaking.connect(owner).changeArtistRewardLimit(4)).to.emit(fanToArtistStaking, "newRewardLimit").withArgs(3, 4);
    });

    it('User should be able to stake and reedem', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, amount } = await loadFixture(deployF2A);
        
        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 60))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount, anyValue);

        expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(amount);
        expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(0);

        await timeMachine(1);

        await expect(fanToArtistStaking.connect(addr1).redeem(artist1.address, addr1.address))
            .to.emit(fanToArtistStaking, 'StakeRedeemed')
            .withArgs(artist1.address, addr1.address);

        expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(0);
        expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(amount);

    });

    it('User should be able to change artist', async () => {
        const {Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, artist2, amount } = await loadFixture(deployF2A);
        
        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 60));

        await expect(fanToArtistStaking.connect(addr1).changeArtistStaked(artist1.address, artist2.address))
            .to.emit(fanToArtistStaking, 'StakeChangedArtist')
            .withArgs(artist1.address, addr1.address, artist2.address);

        await timeMachine(1);

        await expect(fanToArtistStaking.connect(addr1).redeem(artist1.address, addr1.address))
             .to.revertedWith('FanToArtistStaking: stake not found')

        await expect(fanToArtistStaking.connect(addr1).redeem(artist2.address, addr1.address))
             .to.emit(fanToArtistStaking, 'StakeRedeemed')
             .withArgs(artist2.address, addr1.address);

        expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(0);
        expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(amount);

    });

    it('User should be able to increase a stake', async () => {
        const {Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, owner, amount } = await loadFixture(deployF2A);

        await Web3MusicNativeToken.connect(owner).mint(addr1.address, amount);

        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 60))
            .to.emit(fanToArtistStaking, 'StakeCreated')
            .withArgs(artist1.address, addr1.address, amount, anyValue);

        await expect(fanToArtistStaking.connect(addr1).increaseAmountStaked(artist1.address, amount))
            .to.emit(fanToArtistStaking, "StakeIncreased")
            .withArgs(artist1.address, addr1.address, amount);

        expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(amount*2n);
        expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(0);
    });

    it('User should be able to extend a stake', async () => {
        const {Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, owner, amount } = await loadFixture(deployF2A);

        const blockNumBefore = await ethers.provider.getBlockNumber();
        const blockBefore = await ethers.provider.getBlock(blockNumBefore);

        await Web3MusicNativeToken.connect(owner).mint(addr1.address, amount);

        const receipt1 = await fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 60);
        const transactionReceipt1 = await receipt1.wait();
        
        const end1 = transactionReceipt1?.events && transactionReceipt1?.events[3].args && transactionReceipt1.events[3].args['end']; 

        expect(end1).to.be.closeTo(blockBefore.timestamp + 60, 5); //Verified with a 5-second error

        const receipt2 = await fanToArtistStaking.connect(addr1).extendStake(artist1.address, 60);
        const transactionReceipt2 = await receipt2.wait();
        
        const end2 = transactionReceipt2?.events && transactionReceipt2?.events[0].args && transactionReceipt2.events[0].args['end'];

        expect(end2).to.be.closeTo(blockBefore.timestamp + 120, 5); //Verified with a 5-second error

        //Emit verification
        await expect(fanToArtistStaking.connect(addr1).extendStake(artist1.address, 60)).to.emit(fanToArtistStaking, "StakeEndChanged")
            .withArgs(artist1.address, addr1.address, anyValue);
    });

    it('User should not be able to change REWARD_LIMIT', async () => {
        const { fanToArtistStaking, addr1 } = await loadFixture(deployF2A);
        
        await expect(fanToArtistStaking.connect(addr1).changeArtistRewardLimit(50))
            .to.revertedWith("Ownable: caller is not the owner");
    });

    it('User should not be able to stake 0 tokens', async () => {
        const { fanToArtistStaking, addr1, artist1} = await loadFixture(deployF2A);;
        
        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, 0, 3600))
            .to.revertedWith("FanToArtistStaking: the amount can not be zero");
    });

    it('User should not be able to increase stake 0 tokens', async () => {
        const { fanToArtistStaking, addr1, artist1} = await loadFixture(deployF2A);

        await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, 1, 3600))
        
        await expect(fanToArtistStaking.connect(addr1).increaseAmountStaked(artist1.address, 0))
            .to.revertedWith("FanToArtistStaking: the amount can not be zero");
    });

    it('User should be able to redeem stake after the artist is not longer verified', async () => {
        const { Web3MusicNativeToken, fanToArtistStaking, owner, addr1, artist1} = await loadFixture(deployF2A);

        await fanToArtistStaking.connect(addr1).stake(artist1.address, 1, 3600);

        expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(9999999999999999999n);

        await timeMachine(70);

        await expect(fanToArtistStaking.removeArtist(artist1.address, owner.address)).emit(fanToArtistStaking, "ArtistRemoved");
        
        await fanToArtistStaking.connect(addr1).redeem(artist1.address, addr1.address);

        expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(10000000000000000000n);

    });

    describe('Reverts', () => {
        it('A user should not be able to change artist reward limit', async () => {
            const { fanToArtistStaking, addr1 } = await loadFixture(deployF2A);
            await expect(fanToArtistStaking.connect(addr1).changeArtistRewardLimit(4)).to.revertedWith("Ownable: caller is not the owner");
        });
        it('Should not be able to add in artistWhitelist the zero address', async () => {
            const { fanToArtistStaking, owner } = await loadFixture(deployF2A);
            await expect(fanToArtistStaking.connect(owner).addArtist(ethers.constants.AddressZero, owner.address)).to.revertedWith("FanToArtistStaking: the artist address can not be 0");
        });
        it('It should not be possible to change the artistRewardRate to zero', async () => {
            const { fanToArtistStaking, owner } = await loadFixture(deployF2A);
            await expect(fanToArtistStaking.connect(owner).changeArtistRewardRate(0, owner.address)).to.revertedWith("FanToArtistStaking: the artist reward rate can not be 0");
        });
        it('It should not be possible to change the artistRewardRate too many times in a short time', async () => {
            const { fanToArtistStaking, owner } = await loadFixture(deployF2A);
            await fanToArtistStaking.connect(owner).changeArtistRewardRate(1, owner.address);
            await expect(fanToArtistStaking.connect(owner).changeArtistRewardRate(2, owner.address)).to.revertedWith("FanToArtistStaking: the artist reward cannot be changed yet");
        });
        it('The user should not be able to increase the stake period below the minimum limit or the maximum limit', async() => {
            const { fanToArtistStaking, addr1, artist1, amount } = await loadFixture(deployF2A);

            await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 60))
                .to.emit(fanToArtistStaking, 'StakeCreated')
                .withArgs(artist1.address, addr1.address, amount, anyValue);

            await expect(fanToArtistStaking.connect(addr1).extendStake(artist1.address, 9))
                .to.revertedWith("FanToArtistStaking: the stake period exceed the maximum or less than minimum")
            await expect(fanToArtistStaking.connect(addr1).extendStake(artist1.address, 86401))
                .to.revertedWith("FanToArtistStaking: the stake period exceed the maximum or less than minimum")
        });
        it('User should not be able to increase the stake period over the old end more maximum limit', async() => {
            const {fanToArtistStaking, addr1, artist1, amount } = await loadFixture(deployF2A);

            await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 120)) //In stake for 2 minutes
                .to.emit(fanToArtistStaking, 'StakeCreated')
                .withArgs(artist1.address, addr1.address, amount, anyValue);

            await timeMachine(1);

            await expect(fanToArtistStaking.connect(addr1).extendStake(artist1.address, 86400))
                .to.revertedWith("FanToArtistStaking: the new stake period exceeds the maximum")
        });
        it('User should not be able to increase the stake period of ended stake', async() => {
            const { fanToArtistStaking, addr1, artist1, amount } = await loadFixture(deployF2A);

            await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 60))
                .to.emit(fanToArtistStaking, 'StakeCreated')
                .withArgs(artist1.address, addr1.address, amount, anyValue);

            await timeMachine(1);

            await expect(fanToArtistStaking.connect(addr1).extendStake(artist1.address, 20))
                .to.revertedWith("FanToArtistStaking: last stake cant be changed")
        });
        it('User should not be able to increase the stake below the minimum stake period ', async() => {
            const {Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, owner, amount } = await loadFixture(deployF2A);

            await Web3MusicNativeToken.connect(owner).mint(addr1.address, amount/2n);

            await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 61))
                .to.emit(fanToArtistStaking, 'StakeCreated')
                .withArgs(artist1.address, addr1.address, amount, anyValue);

            await timeMachine(1);

            await expect(fanToArtistStaking.connect(addr1).increaseAmountStaked(artist1.address, amount/2n))
                .to.revertedWith("FanToArtistStaking: can not increase the amount below the minimum stake period")
        });
        it('User should not be able to change the artist staked to a not verified artist', async() => {
            const { fanToArtistStaking, addr1, artist1 } = await loadFixture(deployF2A);

            await expect(fanToArtistStaking.connect(addr1).changeArtistStaked(artist1.address, addr1.address))
                .to.revertedWith("FanToArtistStaking: the artist is not a verified artist");
    
        });
        it('User should not be able to change the artist staked if the stake not exist ', async() => {
            const { fanToArtistStaking, addr1, artist1, artist2, owner, amount } = await loadFixture(deployF2A);

            await expect(fanToArtistStaking.connect(addr1).changeArtistStaked(artist1.address, artist2.address))
                .to.revertedWith("FanToArtistStaking: no stake found");
    
        });
        it('User should not be able to change the artist staked if the stake is ended ', async() => {
            const {Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, artist2, amount } = await loadFixture(deployF2A);
            
            await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 60))
                .to.emit(fanToArtistStaking, 'StakeCreated')
                .withArgs(artist1.address, addr1.address, amount, anyValue);

            await timeMachine(1);

            await expect(fanToArtistStaking.connect(addr1).changeArtistStaked(artist1.address, artist2.address))
                .to.revertedWith("FanToArtistStaking: last stake cant be changed");
    
        });
        it('User should not be able to stake on a new artist if they already have a stake on it', async() => {
            const {Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, artist2, owner, amount } = await loadFixture(deployF2A);

            await Web3MusicNativeToken.connect(owner).mint(addr1.address, amount/2n);
            
            await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount/2n, 60)) 
                .to.emit(fanToArtistStaking, 'StakeCreated')
                .withArgs(artist1.address, addr1.address, amount/2n, anyValue);
            await expect(fanToArtistStaking.connect(addr1).stake(artist2.address, amount/2n, 60))
                .to.emit(fanToArtistStaking, 'StakeCreated')
                .withArgs(artist2.address, addr1.address, amount/2n, anyValue);

            await timeMachine(1);

            await expect(fanToArtistStaking.connect(addr1).changeArtistStaked(artist1.address, artist2.address))
                .to.revertedWith("FanToArtistStaking: already staking the new artist");
    
        });
        it('User should not be able to redeem if the stake is not ended ', async() => {
            const {Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, owner, amount } = await loadFixture(deployF2A);

            await Web3MusicNativeToken.connect(owner).mint(addr1.address, amount/2n);

            await expect(fanToArtistStaking.connect(addr1).stake(artist1.address, amount, 60))
                .to.emit(fanToArtistStaking, 'StakeCreated')
                .withArgs(artist1.address, addr1.address, amount, anyValue);

            await expect(fanToArtistStaking.connect(addr1).redeem(artist1.address, addr1.address))
                .to.revertedWith("FanToArtistStaking: the stake is not ended")
        });
    });

    describe('Super Stake', async () => {
        it('A user should be able to stake on multiple artists simultaneously', async () => {
            const { Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, artist2, artist3, amount } = await loadFixture(deployF2A);

            await fanToArtistStaking.connect(addr1).superStake([artist1.address, artist2.address, artist3.address],[amount/3n, amount/3n, amount/3n],[60, 60, 60]);
            expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(amount - 1n);
            expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(1n);
            expect(await fanToArtistStaking.getVotes(addr1.address)).to.equal(amount - 1n);
        })
        describe('Reverts', () => {
            it('A user should not be able to stake on multiple artists if inputs have different lengths', async () => {
                const { Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, artist2, artist3, amount } = await loadFixture(deployF2A);
    
                await expect(fanToArtistStaking.connect(addr1).superStake([artist1.address, artist2.address, artist3.address],[amount/3n, amount/3n],[60, 60, 60]))
                    .to.revertedWith("FanToArtistStaking: calldata format error");
                await expect(fanToArtistStaking.connect(addr1).superStake([artist1.address, artist2.address, artist3.address],[amount/3n, amount/3n],[60, 60]))
                    .to.revertedWith("FanToArtistStaking: calldata format error");
                await expect(fanToArtistStaking.connect(addr1).superStake([artist1.address, artist2.address],[amount/3n, amount/3n],[60, 60, 60]))
                    .to.revertedWith("FanToArtistStaking: calldata format error");

                expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(0);
                expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(amount);
                expect(await fanToArtistStaking.getVotes(addr1.address)).to.equal(0);
            });
            describe('If one input is wrong all the transtactions must be reverted', async () =>  {
                it('A artist is not verified', async () => {
                    const { Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, artist2, amount } = await loadFixture(deployF2A);
        
                    await expect(fanToArtistStaking.connect(addr1).superStake([artist1.address, artist2.address, addr1.address],[amount/3n, amount/3n, amount/3n], [60, 60, 60]))
                        .to.revertedWith("FanToArtistStaking: the artist is not a verified artist");
                    expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(0);
                    expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(amount);
                    expect(await fanToArtistStaking.getVotes(addr1.address)).to.equal(0);
                })
                it('An amount exceeds balance', async () => {
                    const { Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, artist2, artist3, amount } = await loadFixture(deployF2A);
        
                    await expect(fanToArtistStaking.connect(addr1).superStake([artist1.address, artist2.address, artist3.address],[amount/3n, amount/3n, amount], [60, 60, 60]))
                        .to.revertedWith("ERC20: transfer amount exceeds balance");
                    expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(0);
                    expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(amount);
                    expect(await fanToArtistStaking.getVotes(addr1.address)).to.equal(0);
                })
                it('An amount is zero', async () => {
                    const { Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, artist2, artist3, amount } = await loadFixture(deployF2A);
        
                    await expect(fanToArtistStaking.connect(addr1).superStake([artist1.address, artist2.address, artist3.address],[amount/3n, amount/3n, 0], [60, 60, 60]))
                        .to.revertedWith("FanToArtistStaking: the amount can not be zero");
                    expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(0);
                    expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(amount);
                    expect(await fanToArtistStaking.getVotes(addr1.address)).to.equal(0);
                })
                it('A end is less than minimum', async () => {
                    const { Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, artist2, artist3, amount } = await loadFixture(deployF2A);
        
                    await expect(fanToArtistStaking.connect(addr1).superStake([artist1.address, artist2.address, artist3.address],[amount/3n, amount/3n, amount/3n], [9, 60, 60]))
                        .to.revertedWith("FanToArtistStaking: the end period is less than minimum");
                    expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(0);
                    expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(amount);
                    expect(await fanToArtistStaking.getVotes(addr1.address)).to.equal(0);
                })
                it('A end is more than maximum', async () => {
                    const { Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, artist2, artist3, amount } = await loadFixture(deployF2A);
        
                    await expect(fanToArtistStaking.connect(addr1).superStake([artist1.address, artist2.address, artist3.address],[amount/3n, amount/3n, amount/3n], [86401, 60, 60]))
                        .to.revertedWith("FanToArtistStaking: the stake period exceed the maximum");
                    expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(0);
                    expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(amount);
                    expect(await fanToArtistStaking.getVotes(addr1.address)).to.equal(0);
                })
                it('An artist is already staked', async () => {
                    const { Web3MusicNativeToken, fanToArtistStaking, addr1, artist1, artist2, amount } = await loadFixture(deployF2A);
                    
                    await fanToArtistStaking.connect(addr1).stake(artist1.address, amount/3n, 60);

                    await expect(fanToArtistStaking.connect(addr1).superStake([artist1.address, artist2.address],[amount/3n, amount/3n], [60, 60]))
                        .to.revertedWith("FanToArtistStaking: already staking");
                    expect(await Web3MusicNativeToken.balanceOf(fanToArtistStaking.address)).to.equal(amount/3n);
                    expect(await Web3MusicNativeToken.balanceOf(addr1.address)).to.equal(amount - amount/3n);
                    expect(await fanToArtistStaking.getVotes(addr1.address)).to.equal(amount/3n);
                })
            });
        });
    });
});