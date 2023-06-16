import * as hre from 'hardhat';
import { confirmDeploy, loadBaseUtils } from './common';
import { CHAIN } from '../helpers';
import { LENS_ABI } from './abi_lens';
import { readFileSync } from 'fs';
import { Bytes } from 'ethers';
declare const global: any;
const privateKey = readFileSync('.private_key', 'utf-8');
const testWallet = new hre.ethers.Wallet(privateKey);
const testProfile = 34370;
const lensHub: { [key: string]: string } = {
  [CHAIN.Polygon]: '0xDb46d1Dc155634FbC732f92E853b10B288AD5a1d',
  [CHAIN.PolygonTestNet]: '0x60Ae865ee4C725cd04353b5AAb364553f56ceF82',
};

const deployed: { [key: string]: string } = {
  [CHAIN.PolygonTestNet]: '0x53c2ECA15ca7c4302925e0FD97526AEf66C31E7F',
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
    global.mirror = mirrorWithSig;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function deploy() {
  const networkName = hre.network.name;
  const factory = await hre.ethers.getContractFactory('TakoLensHub');

  const takoLensHub = await factory.deploy(lensHub[networkName]);

  console.log(`deploy tako lens hub, network = ${networkName}`);

  await confirmDeploy();
  await takoLensHub.deployed();
  global.takoLensHub = takoLensHub;

  console.log(
    `takoLensHub deployed to ${hre.network.name} at ${takoLensHub.address}`
  );

  return takoLensHub.address;
}

async function mirrorWithSig(profileIdPointed: number, pubIdPointed: number) {
  const walletAddress = await testWallet.getAddress();
  const lensHubContract = new hre.ethers.Contract(
    lensHub[hre.network.name],
    LENS_ABI,
    (await hre.ethers.getSigners())[0]
  );
  const nonce = (await lensHubContract.sigNonces(walletAddress)).toNumber();
  const { v, r, s } = await getMirrorWithSigParts(
    testProfile,
    profileIdPointed,
    pubIdPointed,
    [],
    hre.ethers.constants.AddressZero,
    [],
    nonce,
    hre.ethers.constants.MaxUint256.toHexString()
  );
  const tx = await global.takoLensHub.mirrorWithSign({
    profileId: testProfile,
    profileIdPointed: profileIdPointed,
    pubIdPointed: pubIdPointed,
    referenceModuleData: [],
    referenceModule: hre.ethers.constants.AddressZero,
    referenceModuleInitData: [],
    sig: {
      v,
      r,
      s,
      deadline: hre.ethers.constants.MaxUint256.toHexString(),
    },
  });
  console.log(tx);
}

async function getMirrorWithSigParts(
  profileId: number,
  profileIdPointed: number,
  pubIdPointed: number,
  referenceModuleData: Bytes,
  referenceModule: string,
  referenceModuleInitData: Bytes,
  nonce: number,
  deadline: string
) {
  const msgParams = {
    types: {
      MirrorWithSig: [
        { name: 'profileId', type: 'uint256' },
        { name: 'profileIdPointed', type: 'uint256' },
        { name: 'pubIdPointed', type: 'uint256' },
        { name: 'referenceModuleData', type: 'bytes' },
        { name: 'referenceModule', type: 'address' },
        { name: 'referenceModuleInitData', type: 'bytes' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    domain: domain(),
    value: {
      profileId: profileId,
      profileIdPointed: profileIdPointed,
      pubIdPointed: pubIdPointed,
      referenceModuleData: referenceModuleData,
      referenceModule: referenceModule,
      referenceModuleInitData: referenceModuleInitData,
      nonce: nonce,
      deadline: deadline,
    },
  };
  const sig = await testWallet._signTypedData(
    msgParams.domain,
    msgParams.types,
    msgParams.value
  );
  return hre.ethers.utils.splitSignature(sig);
}

function domain(): {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
} {
  return {
    name: 'Lens Protocol Profiles',
    version: '1',
    chainId: hre.network.config.chainId || 0,
    verifyingContract: lensHub[hre.network.name],
  };
}
