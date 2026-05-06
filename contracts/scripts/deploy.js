const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying with:', deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log('Balance (wei):', balance.toString());

  const Factory = await hre.ethers.getContractFactory('ReferralAnchor');
  const contract = await Factory.deploy(deployer.address);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log('ReferralAnchor deployed to:', address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
