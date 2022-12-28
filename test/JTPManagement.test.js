const { expect } = require('chai');
const { ethers } = hre;

describe('JTPManagement', () => {
    let jtpManagement, jtp, adminRole, minterRole, burnerRole, owner, addr1, addr2, fakeDAO;


    before(async () => { //same as deploy
        const cJTP = await ethers.getContractFactory('JTP');
        jtp = await cJTP.deploy();
        await jtp.deployed();

        const cJTPManagement = await hre.ethers.getContractFactory("JTPManagement");
        jtpManagement = await cJTPManagement.deploy(jtp.address);
        await jtpManagement.deployed();
        await jtp.transferOwnership(jtpManagement.address);

        adminRole = await jtpManagement.DEFAULT_ADMIN_ROLE();
        minterRole = await jtpManagement.MINTER_ROLE();
        burnerRole = await jtpManagement.BURNER_ROLE();
        [owner, addr1, addr2, fakeDAO] = await ethers.getSigners();
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
            await expect(jtp.connect(owner).mint(addr1.address, 10)).to.revertedWith('Ownable: caller is not the owner');
        });

        describe('Minting', () => {
            it('An address with the MINTER_ROLE should be able to mint JTP', async () => {
                await jtpManagement.connect(owner).mint(addr1.address, 10);
                expect(await jtp.balanceOf(addr1.address)).to.equal(10);
            });

            it('An address without the MINTER_ROLE should not be able to mint JTP', async () => {
                await expect(jtpManagement.connect(addr1).mint(addr1.address, 10))
                    .to.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${minterRole}`);
            });
        });

        describe('Burning', () => {
            before(async () => {
                await jtpManagement.connect(owner).mint(jtpManagement.address, 10);
            });

            it('An address without the BURNERN_ROLE should not be able to burn JTP', async () => {
                await expect(jtpManagement.connect(addr1).burn(10))
                    .to.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${burnerRole}`);
            });

            it('An address with the BURNERN_ROLE should be able to burn JTP', async () => {
                await jtpManagement.connect(owner).burn(10);
                expect(await jtp.balanceOf(owner.address)).to.equal(0);
            });
        });

        describe('Transfer Ownership', () => {
            it('An address without the DEFAULT_ADMIN_ROLE should not be able to transfer the ownership of JTP contract', async () => {
                await expect(jtpManagement.connect(addr1).transferJTP(fakeDAO.address))
                    .to.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${adminRole}`);
            });

            it('An address with the DEFAULT_ADMIN_ROLE should be able to transfer the ownership of JTP contract', async () => {
                await jtpManagement.connect(owner).transferJTP(fakeDAO.address);
                expect(await jtp.owner()).to.equal(fakeDAO.address);
            });

            // This test work but is redundant, already tested on JTP.js -> Access Control 
            // it('An address with the correct role should not be able to perfom ', async()=>{ 
            //     await expect(jtpManagement.connect(owner).mint(jtpManagement.address, 10)).to.revertedWith(`Ownable: caller is not the owner`);
            // });
        });
    });
});