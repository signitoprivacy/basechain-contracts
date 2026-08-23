import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import hre from "hardhat";
import { Contract, formatEther, getCreateAddress } from "ethers";
import { assertMainnetDeploymentRequest, getMainnetNetworkControl } from "./release-controls";

const WIRING_GAS_LIMIT = 100_000n;
const BASE_GAS_PRICE_ORACLE = "0x420000000000000000000000000000000000000F";
const BASE_GAS_PRICE_ORACLE_ABI = ["function getL1Fee(bytes) view returns (uint256)"];

function artifactSha256(relativePath: string) {
  return createHash("sha256").update(readFileSync(relativePath)).digest("hex");
}

async function estimateBaseL1Fees(transactionData: string[]) {
  const oracle = new Contract(
    BASE_GAS_PRICE_ORACLE,
    BASE_GAS_PRICE_ORACLE_ABI,
    hre.ethers.provider
  );
  const fees = await Promise.all(
    transactionData.map((data) => oracle.getL1Fee(data) as Promise<bigint>)
  );
  return fees.reduce((total, fee) => total + fee, 0n);
}

async function main() {
  const network = await hre.ethers.provider.getNetwork();
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No dedicated Mainnet deployer is configured. A relayer or test wallet must not be substituted."
    );
  }

  const control = getMainnetNetworkControl(hre.network.name);
  const approval = assertMainnetDeploymentRequest({
    networkName: hre.network.name,
    chainId: network.chainId,
    confirmation: process.env[control.approvalEnv],
    deployerAddress: deployer.address,
    relayerAddress: process.env[control.relayerEnv],
    approvedDeployerAddress: process.env[control.approvedDeployerEnv],
    approvedRelayerAddress: process.env[control.approvedRelayerEnv],
    fundingApprovalReference: process.env[control.fundingApprovalEnv],
    maximumCostWei: process.env[control.maxCostWeiEnv],
  });

  const nonce = await hre.ethers.provider.getTransactionCount(deployer.address, "pending");
  const shieldedEthAddress = getCreateAddress({ from: deployer.address, nonce });
  const poolAddress = getCreateAddress({ from: deployer.address, nonce: nonce + 1 });
  const ShieldedETH = await hre.ethers.getContractFactory("ShieldedETH");
  const SignitoPool = await hre.ethers.getContractFactory("SignitoPool");
  const shieldedEthTransaction = await ShieldedETH.getDeployTransaction();
  const poolTransaction = await SignitoPool.getDeployTransaction(
    shieldedEthAddress,
    process.env[control.relayerEnv]
  );
  const wiringData = ShieldedETH.interface.encodeFunctionData("setPool", [poolAddress]);
  if (!shieldedEthTransaction.data || !poolTransaction.data) {
    throw new Error("Compiled deployment bytecode is unavailable.");
  }

  const [shieldedEthGas, poolGas, feeData, balance] = await Promise.all([
    hre.ethers.provider.estimateGas({ from: deployer.address, data: shieldedEthTransaction.data }),
    hre.ethers.provider.estimateGas({ from: deployer.address, data: poolTransaction.data }),
    hre.ethers.provider.getFeeData(),
    hre.ethers.provider.getBalance(deployer.address),
  ]);
  const feePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
  if (!feePerGas || feePerGas <= 0n) {
    throw new Error("The RPC did not provide a usable fee estimate.");
  }

  const estimatedExecutionGas = shieldedEthGas + poolGas + WIRING_GAS_LIMIT;
  const estimatedExecutionCost = estimatedExecutionGas * feePerGas;
  const estimatedBaseL1Cost =
    network.chainId === 8453n
      ? await estimateBaseL1Fees([shieldedEthTransaction.data, poolTransaction.data, wiringData])
      : 0n;
  const estimatedTotalCost = estimatedExecutionCost + estimatedBaseL1Cost;
  if (estimatedTotalCost > approval.maximumCostWei) {
    throw new Error(
      `Estimated deployment cost ${estimatedTotalCost.toString()} wei exceeds the approved cap ${approval.maximumCostWei.toString()} wei.`
    );
  }
  if (balance < approval.maximumCostWei) {
    throw new Error(
      `Deployer balance ${balance.toString()} wei is below the approved cap ${approval.maximumCostWei.toString()} wei.`
    );
  }

  console.log(
    JSON.stringify(
      {
        mode: "read-only-mainnet-preflight",
        network: hre.network.name,
        chainId: network.chainId.toString(),
        deployer: deployer.address,
        relayer: process.env[control.relayerEnv],
        predictedAddresses: { shieldedEth: shieldedEthAddress, signitoPool: poolAddress },
        artifactSha256: {
          shieldedEth: artifactSha256("artifacts/src/ShieldedETH.sol/ShieldedETH.json"),
          signitoPool: artifactSha256("artifacts/src/SignitoPool.sol/SignitoPool.json"),
        },
        estimatedGas: {
          shieldedEthDeployment: shieldedEthGas.toString(),
          signitoPoolDeployment: poolGas.toString(),
          wiringGasLimit: WIRING_GAS_LIMIT.toString(),
          total: estimatedExecutionGas.toString(),
        },
        estimatedCostWei: {
          execution: estimatedExecutionCost.toString(),
          baseL1Data: estimatedBaseL1Cost.toString(),
          total: estimatedTotalCost.toString(),
          approvedCap: approval.maximumCostWei.toString(),
        },
        estimatedCostEth: formatEther(estimatedTotalCost),
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