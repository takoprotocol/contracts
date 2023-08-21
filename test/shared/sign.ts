import { testWallet } from '../__setup.spec';
import hre from 'hardhat';

export async function getLoanWithSigParts(
  index: number,
  curator: string,
  contentId: string,
  deadline: number,
  verifyingContract: string,
  name = 'Tako Lens Hub'
) {
  const msgParams = {
    types: {
      LoanWithSig: [
        { name: 'index', type: 'uint256' },
        { name: 'curator', type: 'address' },
        { name: 'contentId', type: 'string' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    domain: domain(verifyingContract, name),
    value: {
      index,
      curator,
      contentId,
      deadline,
    },
  };
  const sig = await testWallet._signTypedData(
    msgParams.domain,
    msgParams.types,
    msgParams.value
  );
  return hre.ethers.utils.splitSignature(sig);
}

export async function getVerifiedCuratorsData(
  curatorIds: number[],
  curators: string[],
  deadline: number,
  verifyingContract: string
) {
  const msgParams = {
    types: {
      VerifiedCurators: [
        { name: 'curatorIds', type: 'uint256[]' },
        { name: 'curators', type: 'address[]' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    domain: domain(verifyingContract, 'Tako Farcaster Hub'),
    value: {
      curatorIds,
      curators,
      deadline,
    },
  };
  const sig = await testWallet._signTypedData(
    msgParams.domain,
    msgParams.types,
    msgParams.value
  );
  const splitSignature = hre.ethers.utils.splitSignature(sig);
  return {
    curatorIds,
    curators,
    relayer: testWallet.address,
    sig: {
      v: splitSignature.v,
      r: splitSignature.r,
      s: splitSignature.s,
      deadline,
    },
  };
}

function domain(
  verifyingContract: string,
  name: string
): {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
} {
  return {
    name,
    version: '1',
    chainId: hre.network.config.chainId || 0,
    verifyingContract: verifyingContract,
  };
}
