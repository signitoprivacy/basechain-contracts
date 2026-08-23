import hre from "hardhat";

const NETWORK_ADDRESS_ENV = {
  "base-sepolia": {
    shieldedEth: "BASE_SEPOLIA_SHETH_ADDRESS",
    pool: "BASE_SEPOLIA_POOL_ADDRESS",
    relayer: "BASE_SEPOLIA_RELAYER_ADDRESS",
  },
  "ethereum-sepolia": {
    shieldedEth: "ETHEREUM_SEPOLIA_SHETH_ADDRESS",
    pool: "ETHEREUM_SEPOLIA_POOL_ADDRESS",
    relayer: "ETHEREUM_SEPOLIA_RELAYER_ADDRESS",
  },
  "base-mainnet": {
    shieldedEth: "BASE_MAINNET_SHETH_ADDRESS",
    pool: "BASE_MAINNET_POOL_ADDRESS",
    relayer: "BASE_MAINNET_RELAYER_ADDRESS",
  },
  "ethereum-mainnet": {
    shieldedEth: "ETHEREUM_MAINNET_SHETH_ADDRESS",
    pool: "ETHEREUM_MAINNET_POOL_ADDRESS",
    relayer: "ETHEREUM_MAINNET_RELAYER_ADDRESS",
  },
} as const;

async function main() {
  const env = NETWORK_ADDRESS_ENV[hre.network.name as keyof typeof NETWORK_ADDRESS_ENV];
  if (!env) {
    throw new Error(
      `Verification is not enabled for "${hre.network.name}".`
    );
  }

  const shETHAddress = process.env[env.shieldedEth];
  const poolAddress = process.env[env.pool];
  const relayerAddress = process.env[env.relayer];

  if (!shETHAddress || !poolAddress || !relayerAddress) {
    throw new Error(
      `Set ${env.shieldedEth}, ${env.pool}, and ${env.relayer} before verification.`
    );
  }

  console.log("Verifying ShieldedETH:", shETHAddress);
  await hre.run("verify:verify", {
    address: shETHAddress,
    constructorArguments: [],
  });

  console.log("Verifying SignitoPool:", poolAddress);
  await hre.run("verify:verify", {
    address: poolAddress,
    constructorArguments: [shETHAddress, relayerAddress],
  });

  console.log("Verification complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
