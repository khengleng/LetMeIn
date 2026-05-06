const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('ReferralAnchor', function () {
  async function deployFixture() {
    const [owner, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory('ReferralAnchor');
    const contract = await Factory.deploy(owner.address);
    await contract.waitForDeployment();
    return { contract, owner, other };
  }

  it('anchors batch and emits event', async function () {
    const { contract } = await deployFixture();
    const tenantHash = ethers.keccak256(ethers.toUtf8Bytes('tenant-1'));
    const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes('root-1'));

    const tx = await contract.anchorBatch(tenantHash, merkleRoot);
    const receipt = await tx.wait();

    const block = await ethers.provider.getBlock(receipt.blockNumber);

    await expect(tx)
      .to.emit(contract, 'ReferralAnchored')
      .withArgs(tenantHash, merkleRoot, block.timestamp);
  });

  it('reverts for non-owner caller', async function () {
    const { contract, other } = await deployFixture();
    const tenantHash = ethers.keccak256(ethers.toUtf8Bytes('tenant-1'));
    const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes('root-1'));

    await expect(contract.connect(other).anchorBatch(tenantHash, merkleRoot)).to.be.revertedWithCustomError(
      contract,
      'OwnableUnauthorizedAccount',
    );
  });

  it('reverts on zero hashes', async function () {
    const { contract } = await deployFixture();

    await expect(contract.anchorBatch(ethers.ZeroHash, ethers.keccak256(ethers.toUtf8Bytes('x')))).to.be.revertedWith(
      'invalid tenantHash',
    );

    await expect(contract.anchorBatch(ethers.keccak256(ethers.toUtf8Bytes('x')), ethers.ZeroHash)).to.be.revertedWith(
      'invalid merkleRoot',
    );
  });
});
