import { use } from 'chai';
import { BaseContract, Signer, Wallet } from 'ethers';
import hre, { ethers } from 'hardhat';
import { solidity } from 'ethereum-waffle';
import {
  FAKE_PRIVATEKEY,
  revertToSnapshot,
  takeSnapshot,
} from './shared/utils';
import { TakoLensHub, ERC20Token } from '../typechain-types';
import { FakeContract, smock } from '@defi-wonderland/smock';
import { LensHubAbi, lensFreeCollectModuleAbi } from './shared/abis';

use(solidity);

export let testWallet: Wallet;
export let accounts: Signer[];
export let deployer: Signer;
export let user: Signer;
export let user1: Signer;
export const users: Signer[] = [];
export let relayer: Signer;

export let lensHubMock: FakeContract<BaseContract>;
export let lensFreeCollectModule: FakeContract<BaseContract>;
export let takoLensHub: TakoLensHub;
export let erc20Token: ERC20Token;

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
  const erc20TokenFactory = await hre.ethers.getContractFactory('ERC20Token');

  takoLensHub = (await takoLensHubFactory
    .connect(deployer)
    .deploy(lensHubMock.address, lensFreeCollectModule.address)) as TakoLensHub;
  erc20Token = (await erc20TokenFactory
    .connect(deployer)
    .deploy()) as ERC20Token;
}

async function initLensHubMock() {
  const profileOwner = await users[0].getAddress();
  const profileOwner1 = await users[1].getAddress();
  lensHubMock = await smock.fake(LensHubAbi);
  lensFreeCollectModule = await smock.fake(lensFreeCollectModuleAbi);
  lensHubMock.mirrorWithSig.returns(1);
  lensHubMock.postWithSig.returns(1);
  lensHubMock.commentWithSig.returns(1);
  lensHubMock.ownerOf.whenCalledWith(1).returns(profileOwner);
  lensHubMock.ownerOf.whenCalledWith(2).returns(profileOwner1);
}
