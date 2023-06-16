import { ethers, network } from 'hardhat';
import hre from 'hardhat';

let snapshotId = '0x1';

export enum AuditState {
  Pending,
  Refuse,
  Pass,
  Cancel,
}

export const ADDRESS_ZERO = ethers.constants.AddressZero;

export async function EVMincreaseTime(time: number) {
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
