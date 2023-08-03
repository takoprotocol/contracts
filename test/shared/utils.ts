import { ethers, network } from 'hardhat';
import hre from 'hardhat';

let snapshotId = '0x1';

export enum AuditStatus {
  Pending,
  Refuse,
  Pass,
  Cancel,
}

export const FAKE_PRIVATEKEY =
  '0x01e4ed93ba50e2eb08ab5a6067916893eb95bee49d91791920eb3b3beb054262';

export const ADDRESS_ZERO = ethers.constants.AddressZero;

export async function EVMIncreaseTime(time: number) {
  await network.provider.request({
    method: 'evm_increaseTime',
    params: [time],
  });
}

export async function EVMMine() {
  await network.provider.request({
    method: 'evm_mine',
  });
}

export async function takeSnapshot() {
  snapshotId = await hre.ethers.provider.send('evm_snapshot', []);
}

export async function revertToSnapshot() {
  await hre.ethers.provider.send('evm_revert', [snapshotId]);
}
