import { use } from 'chai';
import { BaseContract, Signer, Wallet } from 'ethers';
import hre, { ethers } from 'hardhat';
import { solidity } from 'ethereum-waffle';
import {
  FAKE_PRIVATEKEY,
  revertToSnapshot,
  takeSnapshot,
} from './shared/utils';
import { TakoLensHub, TakoToken } from '../typechain-types';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { LensHubAbi } from './shared/abis';

use(solidity);

export let testWallet: Wallet;
export let accounts: Signer[];
export let deployer: Signer;
export let user: Signer;
export let user1: Signer;
export const users: Signer[] = [];
export let relayer: Signer;

export let lensHubMock: FakeContract<BaseContract>;
export let takoLensHub: TakoLensHub;
export let takoToken: TakoToken;

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
  testWallet = new ethers.Wallet(FAKE_PRIVATEKEY).connect(ethers.provider);

  accounts = await hre.ethers.getSigners();
  deployer = accounts[0];
  relayer = accounts[1];
  user = accounts[2];
  user1 = accounts[3];
  for (let i = 0; i < 6; i++) {
    users.push(accounts[4 + i]);
  }
}

async function initContract() {
  await initLensHubMock();
  const takoLensHubFactory = await hre.ethers.getContractFactory('TakoLensHub');
  const takoTokenFactory = await hre.ethers.getContractFactory('TakoToken');

  takoLensHub = (await takoLensHubFactory
    .connect(deployer)
    .deploy(lensHubMock.address)) as TakoLensHub;
  takoToken = (await takoTokenFactory.connect(deployer).deploy()) as TakoToken;
}

async function initLensHubMock() {
  const profileOwner = await users[0].getAddress();
  const profileOwner1 = await users[1].getAddress();
  lensHubMock = await smock.fake(LensHubAbi);
  lensHubMock.mirrorWithSig.returns(1);
  lensHubMock.postWithSig.returns(1);
  lensHubMock.commentWithSig.returns(1);
  lensHubMock.ownerOf.whenCalledWith(1).returns(profileOwner);
  lensHubMock.ownerOf.whenCalledWith(2).returns(profileOwner1);
}
