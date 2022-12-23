const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('JTP', () => {
    let Token, token, owner, addr1, addr2;

    before(async () => {
        Token = await ethers.getContractFactory('JTP');
        token = await Token.deploy();
        [owner, addr1, addr2] = await ethers.getSigners();
        console.log(typeof owner);

    });

    describe('Deployment', () => {
        it('Should set the right owner', async () => {
            expect(await token.owner()).to.equal(owner.address);
        });

        it('TotalSupply should be zero', async () => {
            expect(await token.totalSupply()).to.equal(0);
        });
    });

    describe('Access control', () => {
        it('Only the owner should be able to call the mint', async () => {
            await token.connect(owner).mint(owner.address, 1);
            expect(await token.totalSupply()).to.equal(await token.balanceOf(owner.address));
            
            await expect(token.connect(addr1).mint(addr1.address, 1)).to.be.revertedWith('Ownable: caller is not the owner');
        });

        it('Only the owner should be able to call the burn', async () => {
            await expect(token.connect(addr1).burn(1)).to.be.revertedWith('Ownable: caller is not the owner');

            await token.connect(owner).burn(1);
            expect(await token.totalSupply()).to.equal(await token.balanceOf(owner.address));
        });

        it('Only the owner should be able to call the burnFrom', async () => {
            await expect(token.connect(addr1).burn(1)).to.be.revertedWith('Ownable: caller is not the owner');
        });
        
    });
    
    describe('Behaviour', () => {
        it('TotalSupply should increase as we mint', async () => {
            await token.connect(owner).mint(addr1.address, 100);

            expect(await token.totalSupply()).to.equal(await token.balanceOf(addr1.address));
        });

        it('TotalSupply should decrease as we burn', async () => {
            await token.connect(addr1).approve(owner.address, 100);
            await token.connect(owner).burnFrom(addr1.address, 100);

            expect(await token.totalSupply()).to.equal(await token.balanceOf(addr1.address)).to.equal(0);
        });
    });
});