import * as hre from 'hardhat';
import { confirmDeploy, loadBaseUtils } from './common';
import { CHAIN } from '../helpers';
import { readFileSync } from 'fs';
declare const global: any;
const privateKey = readFileSync('.private_key', 'utf-8');
const testWallet = new hre.ethers.Wallet(privateKey);
const deployed: { [key: string]: string } = {
  [CHAIN.Polygon]: '',
  [CHAIN.PolygonTestNet]: '0x00cf5902afD69Ee2ee5DCFed14571C688D9c0DCF',
};

async function main() {
  await loadBaseUtils();
  const networkName = hre.network.name;

  if (networkName in deployed) {
    const contractAddr = deployed[networkName];
    const takoFarcasterHub = await hre.ethers.getContractAt(
      'TakoFarcasterHub',
      contractAddr
    );
    global.takoFarcasterHub = takoFarcasterHub;
    global.deploy = deploy;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function deploy() {
  const networkName = hre.network.name;
  const factory = await hre.ethers.getContractFactory('TakoFarcasterHub');

  const merkleRoot =
    networkName === CHAIN.Polygon ? '' : hre.ethers.constants.HashZero;

  const takoLensHub = await factory.deploy(merkleRoot);

  console.log(`deploy tako farcaster hub, network = ${networkName}`);

  await confirmDeploy();
  await takoLensHub.deployed();
  global.takoLensHub = takoLensHub;

  console.log(
    `takoFarcasterHub deployed to ${hre.network.name} at ${takoLensHub.address}`
  );

  return takoLensHub.address;
}
