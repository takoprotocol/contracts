import { use } from 'chai';
import { Signer } from 'ethers';
import hre from 'hardhat';
import { solidity } from 'ethereum-waffle';
import { revertToSnapshot, takeSnapshot } from './shared/utils';

use(solidity);

export let accounts: Signer[];
export let deployer: Signer;
export let user: Signer;
export let user1: Signer;
export const users: Signer[] = [];
export let relayer: Signer;

export function makeSuiteCleanRoom(name: string, tests: () => void) {
  describe(name, () => {
    beforeEach(async function () {
      await takeSnapshot();
    });
    tests();
    afterEach(async function () {
      await revertToSnapshot();
    });
  });
}

before(async () => {
  await initAccount();
  await initContract();
});

async function initAccount() {
  accounts = await hre.ethers.getSigners();
  deployer = accounts[0];
  relayer = accounts[1];
  user = accounts[2];
  user1 = accounts[3];
  for (let i = 0; i < 6; i++) {
    users.push(accounts[4 + i]);
  }
}

async function initContract() {}
