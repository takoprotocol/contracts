import * as hre from 'hardhat';
import { confirmDeploy, loadBaseUtils } from './common';
import { NETWORKS } from '../helpers';
declare const global: any;
const lensHub: { [key: string]: string } = {
  [NETWORKS.Mainnet]: '0xDb46d1Dc155634FbC732f92E853b10B288AD5a1d',
  [NETWORKS.TestNet]: '0x60Ae865ee4C725cd04353b5AAb364553f56ceF82',
};

const deployed: { [key: string]: string } = {
  [NETWORKS.Mainnet]: '',
  [NETWORKS.TestNet]: '0xd4360d403500347B8024Df5B70E5A50252F78977',
};

async function main() {
  await loadBaseUtils();
  const networkName = hre.network.name;

  if (networkName in deployed) {
    const contractAddr = deployed[networkName];
    const takoOpenLensHub = await hre.ethers.getContractAt(
      'TakoOpenLensHub',
      contractAddr
    );
    global.takoOpenLensHub = takoOpenLensHub;
    global.deploy = deploy;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function deploy() {
  const networkName = hre.network.name;
  const factory = await hre.ethers.getContractFactory('TakoOpenLensHub');
  const merkleRoot =
    networkName === NETWORKS.Mainnet ? '' : hre.ethers.constants.HashZero;

  console.log(`deploy tako open lens hub, network = ${networkName}`);
  await confirmDeploy();

  const takoOpenLensHub = await factory.deploy(
    lensHub[networkName],
    merkleRoot
  );
  await takoOpenLensHub.deployed();
  global.takoOpenLensHub = takoOpenLensHub;

  console.log(
    `takoOpenLensHub deployed to ${hre.network.name} at ${takoOpenLensHub.address}`
  );

  return takoOpenLensHub.address;
}
