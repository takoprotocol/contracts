import { testWallet } from '../__setup.spec';
import hre from 'hardhat';

export async function getLoanWithSigParts(
  index: number,
  curator: string,
  contentId: string,
  deadline: number,
  verifyingContract: string
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
    domain: domain(verifyingContract),
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

function domain(verifyingContract: string): {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
} {
  return {
    name: 'Tako Lens Hub',
    version: '1',
    chainId: hre.network.config.chainId || 0,
    verifyingContract: verifyingContract,
  };
}
