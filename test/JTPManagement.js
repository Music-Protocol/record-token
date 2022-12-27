const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('JTPManagement', () => {
    let jtpManagement, jtp, adminRole, minterRole, burnerRole, owner, addr1, addr2;


    before(async () => { //same as deploy
        const JTPManagement = await hre.ethers.getContractFactory("JTPManagement");
        jtpManagement = await JTPManagement.deploy();
        await jtpManagement.deployed();

        const cJTP = await ethers.getContractFactory('JTP');
        jtp = await cJTP.deploy();
        await jtp.deployed();
        await jtp.transferOwnership(jtpManagement.address);

        adminRole = await jtpManagement.DEFAULT_ADMIN_ROLE();
        minterRole = await jtpManagement.MINTER_ROLE();
        burnerRole = await jtpManagement.BURNER_ROLE();
        [owner, addr1, addr2] = await ethers.getSigners();
    });

    describe('Deployment', () => {
        it('The owner of JTP should be the JTPManagement contract', async () => {
            expect(await jtp.owner()).to.equal(jtpManagement.address);
        });

        it('The deployer of the contract should have all the roles', async () => {
            expect(await jtpManagement.hasRole(adminRole, owner.address)).to.be.true;
            expect(await jtpManagement.hasRole(minterRole, owner.address)).to.be.true;
            expect(await jtpManagement.hasRole(burnerRole, owner.address)).to.be.true;
        });
        it('Another user should not have all the roles', async () => {
            expect(await jtpManagement.hasRole(adminRole, addr1.address)).to.be.false;
            expect(await jtpManagement.hasRole(minterRole, addr1.address)).to.be.false;
            expect(await jtpManagement.hasRole(burnerRole, addr1.address)).to.be.false;
        });
    });

    describe('JTP', () => {
        it('The deployer of JTP should not be able to call a onlyOwner method', async () => {
            await expect(jtp.mint(addr1.address, 10)).to.revertedWith('Ownable: caller is not the owner');
        });
    });
});