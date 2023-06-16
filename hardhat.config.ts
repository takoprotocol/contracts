import '@nomiclabs/hardhat-ethers';
import '@typechain/hardhat';
import { HardhatUserConfig } from 'hardhat/config';
import { readFileSync } from 'fs';
import { CHAIN, HARDHATEVM_CHAINID, TEST_ACCOUNTS } from './helpers';

const privateKey = readFileSync('.private_key', 'utf-8');

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.8.17',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  defaultNetwork: CHAIN.PolygonTestNet,
  networks: {
    [CHAIN.EthereumGoerli]: {
      url: 'https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
      chainId: 5,
      accounts: [privateKey],
      gas: 'auto',
      gasPrice: 'auto',
    },
    [CHAIN.BNBChainTest]: {
      url: 'https://data-seed-prebsc-1-s1.binance.org:8545/',
      chainId: 97,
      accounts: [privateKey],
      gas: 'auto',
      gasPrice: 'auto',
    },
    [CHAIN.PolygonTestNet]: {
      chainId: 80001,
      url: 'https://matic-mumbai.chainstacklabs.com',
      accounts: [privateKey],
      gas: 'auto',
      gasPrice: 'auto',
    },
    hardhat: {
      chainId: HARDHATEVM_CHAINID,
      accounts: TEST_ACCOUNTS.map(
        ({ secretKey, balance }: { secretKey: string; balance: string }) => ({
          privateKey: secretKey,
          balance,
        })
      ),
      gas: 'auto',
      gasPrice: 'auto',
    },
  },
};

export default config;
