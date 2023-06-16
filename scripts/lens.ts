import * as hre from 'hardhat';
import { loadBaseUtils } from './common';
import { CHAIN } from '../helpers';
import { LENS_ABI } from './abi_lens';
import { getLeadingCommentRanges } from 'typescript';
declare const global: any;

const deployed: { [key: string]: string } = {
  [CHAIN.PolygonTestNet]: '0x60Ae865ee4C725cd04353b5AAb364553f56ceF82',
};

async function main() {
  await loadBaseUtils();
  const networkName = hre.network.name;

  if (networkName in deployed) {
    const contractAddr = deployed[networkName];
    const lens = new hre.ethers.Contract(
      contractAddr,
      LENS_ABI,
      (await hre.ethers.getSigners())[0]
    );
    getLeadingCommentRanges;
    global.lens = lens;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
