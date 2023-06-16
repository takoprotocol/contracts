import * as hre from 'hardhat';
import { BigNumber } from 'bignumber.js';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import reql from 'repl';
import { REPLServer } from 'repl';

declare let global: any;
let replServer: REPLServer;

/*

Available utility variable/functions:
    variables:
        me: the account0, usually set from `.private_key`.

    functions:
    e{n}(): make number readable, e.g. e18(await token.balanceOf(address)).
    balance(): print native balance of account0.

*/

let me: SignerWithAddress;

export { loadBaseUtils, me, confirmDeploy };

async function loadVariables() {
  me = await getAccount0();
  global.me = me;
}

async function loadFunctions() {
  genExFunc();
  genBalanceFunc();
}

async function loadBaseUtils() {
  await loadVariables();
  await loadFunctions();

  console.log(
    `current chain is ${hre.network.name}, chainID = ${hre.network.config.chainId}`
  );

  const { addr, balance } = await getGlobalAssetBalance();
  console.log(`current signer is ${addr}, native asset balance = ${balance}`);

  replServer = reql.start();
  global = replServer.context;
}

async function getAccount0() {
  const accounts = await hre.ethers.getSigners();
  return accounts[0];
}

function genBalanceFunc() {
  global['balance'] = async () => {
    const { addr, balance } = await getGlobalAssetBalance();

    console.log(`${addr} native asset balance: ${balance}`);
  };
}

function genExFunc() {
  for (let i = 0; i <= 18; i++) {
    global[`e${i}`] = (val: any) => {
      const readable = new BigNumber(val.toString()).shiftedBy(-i).toFixed();
      console.log(readable);
    };
  }
}

async function getGlobalAssetBalance() {
  const rawBalance = await me.getBalance();
  const readable = new BigNumber(rawBalance.toString())
    .shiftedBy(-18)
    .toFixed();

  return {
    addr: me.address,
    balance: readable,
  };
}

async function getGasPrice() {
  let gasPrice = hre.config.networks[hre.network.name].gasPrice;
  if (gasPrice == 'auto') {
    gasPrice = (await hre.ethers.provider.getGasPrice()).toNumber();
    return gasPrice / 1e9 + '(auto)';
  }

  return gasPrice / 1e9 + '(fixed)';
}

async function confirmDeploy() {
  console.log(`current gasPrice = ${await getGasPrice()}`);
  process.stdout.write('press enter to confirm deploy, otherwise exit');
  await waitKeyPressed();
  console.log();
}

function waitKeyPressed() {
  return new Promise((resolve) => {
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', (data) => {
      if (!data.equals(Buffer.from([0x0d]))) {
        process.exit();
      }

      process.stdin.setRawMode(wasRaw);
      resolve(data.toString());
    });
  });
}
