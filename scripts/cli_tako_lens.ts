import * as hre from 'hardhat';
import { confirmDeploy, loadBaseUtils } from './common';
import { NETWORKS } from '../helpers';
declare const global: any;
const lensHub: { [key: string]: string } = {
  [NETWORKS.Mainnet]: '0xDb46d1Dc155634FbC732f92E853b10B288AD5a1d',
  [NETWORKS.TestNet]: '0x60Ae865ee4C725cd04353b5AAb364553f56ceF82',
};

const deployed: { [key: string]: string } = {
  [NETWORKS.Mainnet]: '0x89dd34D977eF337D8045BF3d7c1Cb461750C0337',
  [NETWORKS.TestNet]: '0x30daf74D17781f0C2aB19db687F14E3293B17E7e',
};

const lensFreeCollectModule: { [key: string]: string } = {
  [NETWORKS.Mainnet]: '0x23b9467334bEb345aAa6fd1545538F3d54436e96',
  [NETWORKS.TestNet]: '0x0BE6bD7092ee83D44a6eC1D949626FeE48caB30c',
};

async function main() {
  await loadBaseUtils();
  const networkName = hre.network.name;

  if (networkName in deployed) {
    const contractAddr = deployed[networkName];
    const takoLensHub = await hre.ethers.getContractAt(
      'TakoLensHub',
      contractAddr
    );
    global.takoLensHub = takoLensHub;
    global.deploy = deploy;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function deploy() {
  const networkName = hre.network.name;
  const factory = await hre.ethers.getContractFactory('TakoLensHub');
  const merkleRoot =
    networkName === NETWORKS.Mainnet
      ? '0x18f751c2889488e3a5f2839ba6ad7aa0818a5ea07d818a0e5ea019c29f3a55ca'
      : hre.ethers.constants.HashZero;

  console.log(`deploy tako lens hub, network = ${networkName}`);
  await confirmDeploy();

  const takoLensHub = await factory.deploy(
    lensHub[networkName],
    lensFreeCollectModule[networkName],
    merkleRoot
  );
  await takoLensHub.deployed();
  global.takoLensHub = takoLensHub;

  console.log(
    `takoLensHub deployed to ${hre.network.name} at ${takoLensHub.address}`
  );

  return takoLensHub.address;
}
