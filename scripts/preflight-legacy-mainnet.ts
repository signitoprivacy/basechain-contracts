import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import hre from "hardhat";
import { Contract, formatEther, getCreateAddress } from "ethers";
import {
  assertLegacyMainnetDeploymentRequest,
  LEGACY_MAINNET_OPERATOR_ADDRESS,
} from "./release-controls";
import {
  assertMatchesCompiledRuntime,
  runtimeArtifactFromBuildInfo,
} from "./runtime-bytecode";

const BASE_LEGACY_SHETH = "0x78decA117eC6DAD3384E7a574F300edef5434688";
const BASE_LEGACY_POOL = "0x949AFBF896b161b5d1E40FD77a4d32D0e427685d";
const WIRING_GAS_LIMIT = 100_000n;

const SHETH_ABI = [
  "function owner() view returns (address)",
  "function pool() view returns (address)",
];
const POOL_ABI = [
  "function owner() view returns (address)",
  "function relayer() view returns (address)",
  "function shETH() view returns (address)",
];

function artifactSha256(relativePath: string) {
  return createHash("sha256").update(readFileSync(relativePath)).digest("hex");
}

async function readRuntimeArtifact(contractName: "ShieldedETH" | "SignitoPool") {
  const artifact = await hre.artifacts.readArtifact(contractName);
  const buildInfo = await hre.artifacts.getBuildInfo(
    `${artifact.sourceName}:${artifact.contractName}`
  );
  return runtimeArtifactFromBuildInfo(artifact, buildInfo);
}

async function preflightBaseLegacy() {
  const network = await hre.ethers.provider.getNetwork();
  if (network.chainId !== 8453n) {
    throw new Error(`Wrong chain: expected Base Mainnet (8453), received ${network.chainId}.`);
  }

  const [shCode, poolCode, shArtifact, poolArtifact] = await Promise.all([
    hre.ethers.provider.getCode(BASE_LEGACY_SHETH),
    hre.ethers.provider.getCode(BASE_LEGACY_POOL),
    readRuntimeArtifact("ShieldedETH"),
    readRuntimeArtifact("SignitoPool"),
  ]);
  if (shCode === "0x" || poolCode === "0x") {
    throw new Error("Base Legacy contract bytecode is missing.");
  }

  const shETH = new Contract(BASE_LEGACY_SHETH, SHETH_ABI, hre.ethers.provider);
  const pool = new Contract(BASE_LEGACY_POOL, POOL_ABI, hre.ethers.provider);
  const [shOwner, linkedPool, poolOwner, relayer, linkedToken, poolBalance] =
    await Promise.all([
      shETH.owner(),
      shETH.pool(),
      pool.owner(),
      pool.relayer(),
      pool.shETH(),
      hre.ethers.provider.getBalance(BASE_LEGACY_POOL),
    ]);

  const expected = LEGACY_MAINNET_OPERATOR_ADDRESS.toLowerCase();
  if (
    shOwner.toLowerCase() !== expected ||
    poolOwner.toLowerCase() !== expected ||
    relayer.toLowerCase() !== expected
  ) {
    throw new Error("Base Legacy ownership or relayer no longer matches the approved legacy operator.");
  }
  if (
    linkedPool.toLowerCase() !== BASE_LEGACY_POOL.toLowerCase() ||
    linkedToken.toLowerCase() !== BASE_LEGACY_SHETH.toLowerCase()
  ) {
    throw new Error("Base Legacy ShieldedETH and SignitoPool wiring is inconsistent.");
  }

  const normalizedShieldedEthRuntime = assertMatchesCompiledRuntime(
    shCode,
    shArtifact,
    "Base Legacy ShieldedETH"
  );
  const normalizedPoolRuntime = assertMatchesCompiledRuntime(
    poolCode,
    poolArtifact,
    "Base Legacy SignitoPool"
  );

  console.log(
    JSON.stringify(
      {
        mode: "read-only-legacy-base-verification",
        chainId: network.chainId.toString(),
        contracts: { shieldedEth: BASE_LEGACY_SHETH, signitoPool: BASE_LEGACY_POOL },
        operator: LEGACY_MAINNET_OPERATOR_ADDRESS,
        poolBalanceWei: poolBalance.toString(),
        poolBalanceEth: formatEther(poolBalance),
        runtimeHash: {
          shieldedEth: hre.ethers.keccak256(normalizedShieldedEthRuntime),
          signitoPool: hre.ethers.keccak256(normalizedPoolRuntime),
        },
        artifactSha256: {
          shieldedEth: artifactSha256("artifacts/src/ShieldedETH.sol/ShieldedETH.json"),
          signitoPool: artifactSha256("artifacts/src/SignitoPool.sol/SignitoPool.json"),
        },
      },
      null,
      2
    )
  );
}

async function preflightEthereumLegacy() {
  const network = await hre.ethers.provider.getNetwork();
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("Legacy Ethereum operator key is not configured.");

  const control = assertLegacyMainnetDeploymentRequest({
    networkName: hre.network.name,
    chainId: network.chainId,
    confirmation: process.env.ETHEREUM_MAINNET_LEGACY_DEPLOYMENT_CONFIRMATION,
    deployerAddress: deployer.address,
    relayerAddress: process.env.ETHEREUM_MAINNET_LEGACY_OPERATOR_ADDRESS,
    approvedDeployerAddress: process.env.ETHEREUM_MAINNET_LEGACY_OPERATOR_ADDRESS,
    approvedRelayerAddress: process.env.ETHEREUM_MAINNET_LEGACY_OPERATOR_ADDRESS,
    fundingApprovalReference:
      process.env.ETHEREUM_MAINNET_LEGACY_FUNDING_APPROVAL_REFERENCE,
    maximumCostWei: process.env.ETHEREUM_MAINNET_LEGACY_MAX_DEPLOYMENT_COST_WEI,
  });

  const nonce = await hre.ethers.provider.getTransactionCount(deployer.address, "pending");
  const shieldedEthAddress = getCreateAddress({ from: deployer.address, nonce });
  const poolAddress = getCreateAddress({ from: deployer.address, nonce: nonce + 1 });
  const ShieldedETH = await hre.ethers.getContractFactory("ShieldedETH");
  const SignitoPool = await hre.ethers.getContractFactory("SignitoPool");
  const [shieldedEthTx, poolTx, feeData, balance] = await Promise.all([
    ShieldedETH.getDeployTransaction(),
    SignitoPool.getDeployTransaction(shieldedEthAddress, LEGACY_MAINNET_OPERATOR_ADDRESS),
    hre.ethers.provider.getFeeData(),
    hre.ethers.provider.getBalance(deployer.address),
  ]);
  if (!shieldedEthTx.data || !poolTx.data) {
    throw new Error("Compiled deployment bytecode is unavailable.");
  }
  const feePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
  if (!feePerGas || feePerGas <= 0n) throw new Error("The RPC did not provide a usable fee estimate.");

  const [shieldedEthGas, poolGas] = await Promise.all([
    hre.ethers.provider.estimateGas({ from: deployer.address, data: shieldedEthTx.data }),
    hre.ethers.provider.estimateGas({ from: deployer.address, data: poolTx.data }),
  ]);
  const estimatedCost = (shieldedEthGas + poolGas + WIRING_GAS_LIMIT) * feePerGas;
  if (estimatedCost > control.maximumCostWei) {
    throw new Error(`Estimated cost exceeds approved cap ${control.maximumCostWei.toString()} wei.`);
  }
  if (balance < control.maximumCostWei) {
    throw new Error(`Legacy operator balance is below approved cap ${control.maximumCostWei.toString()} wei.`);
  }

  console.log(
    JSON.stringify(
      {
        mode: "read-only-legacy-ethereum-preflight",
        chainId: network.chainId.toString(),
        operator: deployer.address,
        predictedAddresses: { shieldedEth: shieldedEthAddress, signitoPool: poolAddress },
        estimatedGas: {
          shieldedEthDeployment: shieldedEthGas.toString(),
          signitoPoolDeployment: poolGas.toString(),
          wiringGasLimit: WIRING_GAS_LIMIT.toString(),
        },
        estimatedCostWei: estimatedCost.toString(),
        estimatedCostEth: formatEther(estimatedCost),
        approvedCapWei: control.maximumCostWei.toString(),
      },
      null,
      2
    )
  );
}

async function main() {
  if (hre.network.name === "base-mainnet") {
    await preflightBaseLegacy();
    return;
  }
  if (hre.network.name === "ethereum-mainnet") {
    await preflightEthereumLegacy();
    return;
  }
  throw new Error("Legacy Mainnet preflight supports only Base Mainnet and Ethereum Mainnet.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});