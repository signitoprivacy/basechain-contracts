import hre from "hardhat";
import {
  assertMainnetDeploymentRequest,
  assertTestDeploymentRequest,
  getMainnetNetworkControl,
  getTestNetworkControl,
} from "./release-controls";
import { assertMatchesCompiledRuntime, runtimeArtifactFromBuildInfo } from "./runtime-bytecode";

async function main() {
  const network = await hre.ethers.provider.getNetwork();
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No dedicated deployer is configured for this network. A test wallet must not be used as an operational wallet."
    );
  }
  const isMainnet =
    hre.network.name === "base-mainnet" || hre.network.name === "ethereum-mainnet";
  const control = isMainnet
    ? getMainnetNetworkControl(hre.network.name)
    : getTestNetworkControl(hre.network.name);
  const relayerAddress = process.env[control.relayerEnv];
  const approvedDeployerAddress = process.env[control.approvedDeployerEnv];
  const approvedRelayerAddress = process.env[control.approvedRelayerEnv];
  const fundingApprovalReference = process.env[control.fundingApprovalEnv];
  let maximumCostWei: bigint | undefined;
  if (isMainnet) {
    const approval = assertMainnetDeploymentRequest({
      networkName: hre.network.name,
      chainId: network.chainId,
      confirmation: process.env[control.approvalEnv],
      deployerAddress: deployer.address,
      relayerAddress,
      approvedDeployerAddress,
      approvedRelayerAddress,
      fundingApprovalReference,
      maximumCostWei:
        "maxCostWeiEnv" in control ? process.env[control.maxCostWeiEnv] : undefined,
    });
    maximumCostWei = approval.maximumCostWei;
  } else {
    assertTestDeploymentRequest({
      networkName: hre.network.name,
      chainId: network.chainId,
      confirmation: process.env[control.approvalEnv],
      deployerAddress: deployer.address,
      relayerAddress,
      approvedDeployerAddress,
      approvedRelayerAddress,
      fundingApprovalReference,
    });
  }
  if (!relayerAddress) {
    throw new Error(`Set a valid dedicated relayer address in ${control.relayerEnv}.`);
  }

  console.log("Network:", hre.network.name);
  console.log("Chain ID:", network.chainId.toString());
  console.log("Deployer / Relayer:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    throw new Error("Deployer has zero balance. Fund the address first.");
  }
  if (maximumCostWei !== undefined && balance < maximumCostWei) {
    throw new Error(
      `Deployer balance ${balance.toString()} wei is below the approved Mainnet cap ${maximumCostWei.toString()} wei.`
    );
  }

  console.log("\n[1/3] Deploying ShieldedETH...");
  const ShieldedETH = await hre.ethers.getContractFactory("ShieldedETH");
  const shETH = await ShieldedETH.deploy();
  await shETH.waitForDeployment();
  const shETHAddress = await shETH.getAddress();
  console.log("ShieldedETH:", shETHAddress);

  console.log("\n[2/3] Deploying SignitoPool...");
  const SignitoPool = await hre.ethers.getContractFactory("SignitoPool");
  const pool = await SignitoPool.deploy(shETHAddress, relayerAddress);
  await pool.waitForDeployment();
  const poolAddress = await pool.getAddress();
  console.log("SignitoPool:", poolAddress);

  console.log("\n[3/3] Wiring shETH.setPool...");
  const wireTx = await shETH.setPool(poolAddress);
  await wireTx.wait();
  const [wiredPool, wiredToken, owner, relayer, shieldedEthCode, poolCode] = await Promise.all([
    shETH.pool(),
    pool.shETH(),
    pool.owner(),
    pool.relayer(),
    hre.ethers.provider.getCode(shETHAddress),
    hre.ethers.provider.getCode(poolAddress),
  ]);
  if (wiredPool.toLowerCase() !== poolAddress.toLowerCase()) {
    throw new Error("Post-deployment verification failed: ShieldedETH pool wiring does not match.");
  }
  if (wiredToken.toLowerCase() !== shETHAddress.toLowerCase()) {
    throw new Error("Post-deployment verification failed: SignitoPool token wiring does not match.");
  }
  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error("Post-deployment verification failed: pool owner does not match the deployer.");
  }
  if (relayer.toLowerCase() !== relayerAddress.toLowerCase()) {
    throw new Error("Post-deployment verification failed: pool relayer does not match the approved role.");
  }
  if (shieldedEthCode === "0x" || poolCode === "0x") {
    throw new Error("Post-deployment verification failed: deployed contract bytecode is missing.");
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
  const normalizedShieldedEthRuntime = assertMatchesCompiledRuntime(
    shieldedEthCode,
    runtimeArtifactFromBuildInfo(shieldedEthArtifact, shieldedEthBuildInfo),
    "ShieldedETH"
  );
  const normalizedPoolRuntime = assertMatchesCompiledRuntime(
    poolCode,
    runtimeArtifactFromBuildInfo(poolArtifact, poolBuildInfo),
    "SignitoPool"
  );
  console.log("Local wiring, owner, relayer, and compiled-bytecode checks passed.");
  console.log(
    "ShieldedETH normalized runtime hash:",
    hre.ethers.keccak256(normalizedShieldedEthRuntime)
  );
  console.log(
    "SignitoPool normalized runtime hash:",
    hre.ethers.keccak256(normalizedPoolRuntime)
  );

  console.log("\nRecord these public deployment addresses in the release manifest:");
  console.log(`ShieldedETH=${shETHAddress}`);
  console.log(`SignitoPool=${poolAddress}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
