import * as hre from 'hardhat';
import { confirmDeploy, loadBaseUtils } from './common';
import { CHAIN } from '../helpers';
import { readFileSync } from 'fs';
declare const global: any;
const privateKey = readFileSync('.private_key', 'utf-8');
const testWallet = new hre.ethers.Wallet(privateKey);

const farcasterIdRegistry: { [key: string]: string } = {
  [CHAIN.Optimism]: '0x00000000fcaf86937e41ba038b4fa40baa4b780a',
  [CHAIN.EthereumGoerli]: '0xda107a1caf36d198b12c16c7b6a1d1c795978c42',
};

const deployed: { [key: string]: string } = {
  [CHAIN.Optimism]: '',
  [CHAIN.EthereumGoerli]: '',
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

  console.log(`deploy tako farcaster hub, network = ${networkName}`);
  await confirmDeploy();

  const takoLensHub = await factory.deploy(
    merkleRoot,
    farcasterIdRegistry[networkName]
  );
  await takoLensHub.deployed();
  global.takoLensHub = takoLensHub;

  console.log(
    `takoFarcasterHub deployed to ${hre.network.name} at ${takoLensHub.address}`
  );

  return takoLensHub.address;
}
