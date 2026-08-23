import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

type NetworkInput = {
  rpcEnv: string;
  privateKeyEnv: string;
  fallbackRpcUrl: string;
  chainId: number;
};

function networkConfig({
  rpcEnv,
  privateKeyEnv,
  fallbackRpcUrl,
  chainId,
}: NetworkInput) {
  const privateKey = process.env[privateKeyEnv];

  return {
    url: process.env[rpcEnv] ?? fallbackRpcUrl,
    accounts: privateKey ? [privateKey] : [],
    chainId,
  };
}

const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY ?? "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY ?? "";
const ETHERSCAN_V2_API_KEY = ETHERSCAN_API_KEY || BASESCAN_API_KEY;

const config: HardhatUserConfig = {
  paths: {
    sources: "./contracts",
    artifacts: "./artifacts",
    cache: "./cache",
  },
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    "base-sepolia": networkConfig({
      rpcEnv: "BASE_SEPOLIA_RPC_URL",
      privateKeyEnv: "BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY",
      fallbackRpcUrl: "https://sepolia.base.org",
      chainId: 84532,
    }),
    "base-mainnet": networkConfig({
      rpcEnv: "BASE_MAINNET_RPC_URL",
      privateKeyEnv: "BASE_MAINNET_DEPLOYER_PRIVATE_KEY",
      fallbackRpcUrl: "https://mainnet.base.org",
      chainId: 8453,
    }),
    "ethereum-sepolia": networkConfig({
      rpcEnv: "ETHEREUM_SEPOLIA_RPC_URL",
      privateKeyEnv: "ETHEREUM_SEPOLIA_DEPLOYER_PRIVATE_KEY",
      fallbackRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
      chainId: 11155111,
    }),
    "ethereum-mainnet": networkConfig({
      rpcEnv: "ETHEREUM_MAINNET_RPC_URL",
      privateKeyEnv: "ETHEREUM_MAINNET_DEPLOYER_PRIVATE_KEY",
      fallbackRpcUrl: "https://ethereum-rpc.publicnode.com",
      chainId: 1,
    }),
  },
  etherscan: {
    apiKey: ETHERSCAN_V2_API_KEY,
    customChains: [
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
      {
        network: "base-mainnet",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
    ],
  },
  sourcify: {
    enabled: false,
  },
};

export default config;
