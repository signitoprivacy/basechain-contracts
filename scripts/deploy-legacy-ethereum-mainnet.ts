import hre from "hardhat";
import {
  assertLegacyMainnetDeploymentRequest,
  LEGACY_MAINNET_OPERATOR_ADDRESS,
} from "./release-controls";
import {
  assertMatchesCompiledRuntime,
  runtimeArtifactFromBuildInfo,
} from "./runtime-bytecode";

async function main() {
  const network = await hre.ethers.provider.getNetwork();
  const [operator] = await hre.ethers.getSigners();
  if (!operator) throw new Error("Legacy Ethereum operator key is not configured.");

  assertLegacyMainnetDeploymentRequest({
    networkName: hre.network.name,
    chainId: network.chainId,
    confirmation: process.env.ETHEREUM_MAINNET_LEGACY_DEPLOYMENT_CONFIRMATION,
    deployerAddress: operator.address,
    relayerAddress: process.env.ETHEREUM_MAINNET_LEGACY_OPERATOR_ADDRESS,
    approvedDeployerAddress: process.env.ETHEREUM_MAINNET_LEGACY_OPERATOR_ADDRESS,
    approvedRelayerAddress: process.env.ETHEREUM_MAINNET_LEGACY_OPERATOR_ADDRESS,
    fundingApprovalReference:
      process.env.ETHEREUM_MAINNET_LEGACY_FUNDING_APPROVAL_REFERENCE,
    maximumCostWei: process.env.ETHEREUM_MAINNET_LEGACY_MAX_DEPLOYMENT_COST_WEI,
  });
  if (hre.network.name !== "ethereum-mainnet") {
    throw new Error("Legacy Ethereum deployment is permitted only on Ethereum Mainnet.");
  }
  if (operator.address.toLowerCase() !== LEGACY_MAINNET_OPERATOR_ADDRESS.toLowerCase()) {
    throw new Error("Configured signer is not the approved legacy Ethereum operator.");
  }

  const ShieldedETH = await hre.ethers.getContractFactory("ShieldedETH");
  const shETH = await ShieldedETH.deploy();
  await shETH.waitForDeployment();
  const shieldedEthAddress = await shETH.getAddress();

  const SignitoPool = await hre.ethers.getContractFactory("SignitoPool");
  const pool = await SignitoPool.deploy(shieldedEthAddress, LEGACY_MAINNET_OPERATOR_ADDRESS);
  await pool.waitForDeployment();
  const poolAddress = await pool.getAddress();

  const wiringTx = await shETH.setPool(poolAddress);
  await wiringTx.wait();

  const [wiredPool, wiredToken, owner, relayer, shieldedEthCode, poolCode] = await Promise.all([
    shETH.pool(),
    pool.shETH(),
    pool.owner(),
    pool.relayer(),
    hre.ethers.provider.getCode(shieldedEthAddress),
    hre.ethers.provider.getCode(poolAddress),
  ]);
  if (
    wiredPool.toLowerCase() !== poolAddress.toLowerCase() ||
    wiredToken.toLowerCase() !== shieldedEthAddress.toLowerCase() ||
    owner.toLowerCase() !== LEGACY_MAINNET_OPERATOR_ADDRESS.toLowerCase() ||
    relayer.toLowerCase() !== LEGACY_MAINNET_OPERATOR_ADDRESS.toLowerCase()
  ) {
    throw new Error("Post-deployment Legacy Ethereum wiring or operator verification failed.");
  }

  const [shieldedEthArtifact, poolArtifact] = await Promise.all([
    hre.artifacts.readArtifact("ShieldedETH"),
    hre.artifacts.readArtifact("SignitoPool"),
  ]);
  const [shieldedEthBuildInfo, poolBuildInfo] = await Promise.all([
    hre.artifacts.getBuildInfo(
      `${shieldedEthArtifact.sourceName}:${shieldedEthArtifact.contractName}`
    ),
    hre.artifacts.getBuildInfo(`${poolArtifact.sourceName}:${poolArtifact.contractName}`),
  ]);
  const shieldedEthRuntime = assertMatchesCompiledRuntime(
    shieldedEthCode,
    runtimeArtifactFromBuildInfo(shieldedEthArtifact, shieldedEthBuildInfo),
    "ShieldedETH"
  );
  const poolRuntime = assertMatchesCompiledRuntime(
    poolCode,
    runtimeArtifactFromBuildInfo(poolArtifact, poolBuildInfo),
    "SignitoPool"
  );

  console.log(
    JSON.stringify(
      {
        network: hre.network.name,
        chainId: network.chainId.toString(),
        operator: operator.address,
        shieldedEth: shieldedEthAddress,
        signitoPool: poolAddress,
        transactionHashes: {
          shieldedEth: shETH.deploymentTransaction()?.hash,
          signitoPool: pool.deploymentTransaction()?.hash,
          setPool: wiringTx.hash,
        },
        runtimeHash: {
          shieldedEth: hre.ethers.keccak256(shieldedEthRuntime),
          signitoPool: hre.ethers.keccak256(poolRuntime),
        },
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});