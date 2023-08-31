import '@nomiclabs/hardhat-ethers';
import '@typechain/hardhat';
import { HardhatUserConfig } from 'hardhat/config';
import { HARDHATEVM_CHAINID, NETWORKS, TEST_ACCOUNTS } from './helpers';

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
  // defaultNetwork: CHAIN.PolygonTestNet,
  networks: {
    [NETWORKS.TestNet]: {
      url: 'http://127.0.0.1:24012/rpc',
      timeout: 999999,
    },
    [NETWORKS.Mainnet]: {
      url: 'http://127.0.0.1:24012/rpc',
      timeout: 999999,
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
