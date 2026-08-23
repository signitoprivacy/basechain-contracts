import { isAddress } from "ethers";

type DeploymentControl = {
  chainId: bigint;
  approvalEnv: string;
  confirmation: string;
  relayerEnv: string;
  approvedDeployerEnv: string;
  approvedRelayerEnv: string;
  fundingApprovalEnv: string;
};

export const TEST_NETWORK_CONTROLS = {
  "base-sepolia": {
    chainId: 84532n,
    approvalEnv: "BASE_SEPOLIA_DEPLOYMENT_CONFIRMATION",
    confirmation: "BASE_SEPOLIA_FRESH_STANDARD_SIGNITO",
    relayerEnv: "BASE_SEPOLIA_RELAYER_ADDRESS",
    approvedDeployerEnv: "BASE_SEPOLIA_APPROVED_DEPLOYER_ADDRESS",
    approvedRelayerEnv: "BASE_SEPOLIA_APPROVED_RELAYER_ADDRESS",
    fundingApprovalEnv: "BASE_SEPOLIA_FUNDING_APPROVAL_REFERENCE",
  },
  "ethereum-sepolia": {
    chainId: 11155111n,
    approvalEnv: "ETHEREUM_SEPOLIA_DEPLOYMENT_CONFIRMATION",
    confirmation: "ETHEREUM_SEPOLIA_FRESH_STANDARD_SIGNITO",
    relayerEnv: "ETHEREUM_SEPOLIA_RELAYER_ADDRESS",
    approvedDeployerEnv: "ETHEREUM_SEPOLIA_APPROVED_DEPLOYER_ADDRESS",
    approvedRelayerEnv: "ETHEREUM_SEPOLIA_APPROVED_RELAYER_ADDRESS",
    fundingApprovalEnv: "ETHEREUM_SEPOLIA_FUNDING_APPROVAL_REFERENCE",
  },
} as const;

export type TestNetworkName = keyof typeof TEST_NETWORK_CONTROLS;

export const MAINNET_NETWORK_CONTROLS = {
  "base-mainnet": {
    chainId: 8453n,
    approvalEnv: "BASE_MAINNET_DEPLOYMENT_CONFIRMATION",
    confirmation: "BASE_MAINNET_FRESH_STANDARD_SIGNITO",
    relayerEnv: "BASE_MAINNET_RELAYER_ADDRESS",
    approvedDeployerEnv: "BASE_MAINNET_APPROVED_DEPLOYER_ADDRESS",
    approvedRelayerEnv: "BASE_MAINNET_APPROVED_RELAYER_ADDRESS",
    fundingApprovalEnv: "BASE_MAINNET_FUNDING_APPROVAL_REFERENCE",
    maxCostWeiEnv: "BASE_MAINNET_MAX_DEPLOYMENT_COST_WEI",
  },
  "ethereum-mainnet": {
    chainId: 1n,
    approvalEnv: "ETHEREUM_MAINNET_DEPLOYMENT_CONFIRMATION",
    confirmation: "ETHEREUM_MAINNET_FRESH_STANDARD_SIGNITO",
    relayerEnv: "ETHEREUM_MAINNET_RELAYER_ADDRESS",
    approvedDeployerEnv: "ETHEREUM_MAINNET_APPROVED_DEPLOYER_ADDRESS",
    approvedRelayerEnv: "ETHEREUM_MAINNET_APPROVED_RELAYER_ADDRESS",
    fundingApprovalEnv: "ETHEREUM_MAINNET_FUNDING_APPROVAL_REFERENCE",
    maxCostWeiEnv: "ETHEREUM_MAINNET_MAX_DEPLOYMENT_COST_WEI",
  },
} as const;

export type MainnetNetworkName = keyof typeof MAINNET_NETWORK_CONTROLS;

export const LEGACY_MAINNET_OPERATOR_ADDRESS =
  "0xf70494e69aE7090dB21179d2412D76566959B43c";

export const LEGACY_MAINNET_NETWORK_CONTROLS = {
  "base-mainnet": {
    chainId: 8453n,
    approvalEnv: "BASE_MAINNET_LEGACY_VERIFICATION_CONFIRMATION",
    confirmation: "BASE_MAINNET_LEGACY_STANDARD_SIGNITO",
    relayerEnv: "BASE_MAINNET_LEGACY_OPERATOR_ADDRESS",
    approvedDeployerEnv: "BASE_MAINNET_LEGACY_OPERATOR_ADDRESS",
    approvedRelayerEnv: "BASE_MAINNET_LEGACY_OPERATOR_ADDRESS",
    fundingApprovalEnv: "BASE_MAINNET_LEGACY_FUNDING_APPROVAL_REFERENCE",
    maxCostWeiEnv: "BASE_MAINNET_LEGACY_MAX_COST_WEI",
  },
  "ethereum-mainnet": {
    chainId: 1n,
    approvalEnv: "ETHEREUM_MAINNET_LEGACY_DEPLOYMENT_CONFIRMATION",
    confirmation: "ETHEREUM_MAINNET_LEGACY_STANDARD_SIGNITO",
    relayerEnv: "ETHEREUM_MAINNET_LEGACY_OPERATOR_ADDRESS",
    approvedDeployerEnv: "ETHEREUM_MAINNET_LEGACY_OPERATOR_ADDRESS",
    approvedRelayerEnv: "ETHEREUM_MAINNET_LEGACY_OPERATOR_ADDRESS",
    fundingApprovalEnv: "ETHEREUM_MAINNET_LEGACY_FUNDING_APPROVAL_REFERENCE",
    maxCostWeiEnv: "ETHEREUM_MAINNET_LEGACY_MAX_DEPLOYMENT_COST_WEI",
  },
} as const;

export type LegacyMainnetNetworkName = keyof typeof LEGACY_MAINNET_NETWORK_CONTROLS;

export function getTestNetworkControl(networkName: string) {
  const control = TEST_NETWORK_CONTROLS[networkName as TestNetworkName];
  if (!control) {
    throw new Error(
      `Refusing deployment on "${networkName}". Phase 2 only permits isolated Base Sepolia and Ethereum Sepolia releases.`
    );
  }
  return control;
}

export function getMainnetNetworkControl(networkName: string) {
  const control = MAINNET_NETWORK_CONTROLS[networkName as MainnetNetworkName];
  if (!control) {
    throw new Error(
      `Refusing Mainnet preflight on "${networkName}". Only Base Mainnet and Ethereum Mainnet are permitted.`
    );
  }
  return control;
}

export function getLegacyMainnetNetworkControl(networkName: string) {
  const control =
    LEGACY_MAINNET_NETWORK_CONTROLS[networkName as LegacyMainnetNetworkName];
  if (!control) {
    throw new Error(
      `Refusing Legacy Mainnet release on "${networkName}". Only Base Mainnet verification and Ethereum Mainnet deployment are permitted.`
    );
  }
  return control;
}

type DeploymentRequest = {
  networkName: string;
  chainId: bigint;
  confirmation: string | undefined;
  deployerAddress: string;
  relayerAddress: string | undefined;
  approvedDeployerAddress: string | undefined;
  approvedRelayerAddress: string | undefined;
  fundingApprovalReference: string | undefined;
};

function assertDeploymentRequest(
  control: DeploymentControl,
  {
    networkName,
    chainId,
    confirmation,
    deployerAddress,
    relayerAddress,
    approvedDeployerAddress,
    approvedRelayerAddress,
    fundingApprovalReference,
  }: DeploymentRequest
) {

  if (chainId !== control.chainId) {
    throw new Error(
      `Wrong chain: expected ${control.chainId.toString()}, received ${chainId.toString()}.`
    );
  }
  if (confirmation !== control.confirmation) {
    throw new Error(
      `Deployment confirmation missing. Set ${control.approvalEnv} to the approved confirmation value before submitting a transaction.`
    );
  }
  if (!relayerAddress || !isAddress(relayerAddress)) {
    throw new Error(`Set a valid dedicated relayer address in ${control.relayerEnv}.`);
  }
  if (!approvedDeployerAddress || !isAddress(approvedDeployerAddress)) {
    throw new Error(`Set the approved deployer address in ${control.approvedDeployerEnv}.`);
  }
  if (!approvedRelayerAddress || !isAddress(approvedRelayerAddress)) {
    throw new Error(`Set the approved relayer address in ${control.approvedRelayerEnv}.`);
  }
  if (!fundingApprovalReference?.trim()) {
    throw new Error(`Set the funding approval reference in ${control.fundingApprovalEnv}.`);
  }
  if (deployerAddress.toLowerCase() === relayerAddress.toLowerCase()) {
    throw new Error("Deployer and relayer must be separate approved operational roles.");
  }
  if (deployerAddress.toLowerCase() !== approvedDeployerAddress.toLowerCase()) {
    throw new Error("Configured deployer does not match the approved operational deployer.");
  }
  if (relayerAddress.toLowerCase() !== approvedRelayerAddress.toLowerCase()) {
    throw new Error("Configured relayer does not match the approved operational relayer.");
  }

  return control;
}

export function assertTestDeploymentRequest(request: DeploymentRequest) {
  return assertDeploymentRequest(getTestNetworkControl(request.networkName), request);
}

export function assertMainnetDeploymentRequest(
  request: DeploymentRequest & { maximumCostWei: string | undefined }
) {
  const control = getMainnetNetworkControl(request.networkName);
  assertDeploymentRequest(control, request);

  if (!request.maximumCostWei?.match(/^[1-9]\d*$/)) {
    throw new Error(
      `Set a positive wei-denominated deployment cap in ${control.maxCostWeiEnv} before Mainnet preflight.`
    );
  }

  return {
    ...control,
    maximumCostWei: BigInt(request.maximumCostWei),
  };
}

export function assertLegacyMainnetDeploymentRequest(
  request: DeploymentRequest & { maximumCostWei: string | undefined }
) {
  const control = getLegacyMainnetNetworkControl(request.networkName);
  const {
    networkName,
    chainId,
    confirmation,
    deployerAddress,
    relayerAddress,
    approvedDeployerAddress,
    approvedRelayerAddress,
    fundingApprovalReference,
    maximumCostWei,
  } = request;

  if (chainId !== control.chainId) {
    throw new Error(
      `Wrong chain: expected ${control.chainId.toString()}, received ${chainId.toString()}.`
    );
  }
  if (confirmation !== control.confirmation) {
    throw new Error(
      `Legacy deployment confirmation missing. Set ${control.approvalEnv} to the approved confirmation value before submitting a transaction.`
    );
  }
  if (
    !relayerAddress ||
    !approvedDeployerAddress ||
    !approvedRelayerAddress ||
    !isAddress(relayerAddress) ||
    !isAddress(approvedDeployerAddress) ||
    !isAddress(approvedRelayerAddress)
  ) {
    throw new Error(
      `Legacy release requires the approved legacy operator address in ${control.relayerEnv}.`
    );
  }
  if (!fundingApprovalReference?.trim()) {
    throw new Error(`Set the funding approval reference in ${control.fundingApprovalEnv}.`);
  }
  if (!maximumCostWei?.match(/^[1-9]\d*$/)) {
    throw new Error(
      `Set a positive wei-denominated deployment cap in ${control.maxCostWeiEnv} before Legacy Mainnet preflight.`
    );
  }

  const expectedOperator = LEGACY_MAINNET_OPERATOR_ADDRESS.toLowerCase();
  const configuredAddresses = [
    deployerAddress,
    relayerAddress,
    approvedDeployerAddress,
    approvedRelayerAddress,
  ].map((address) => address.toLowerCase());
  if (configuredAddresses.some((address) => address !== expectedOperator)) {
    throw new Error(
      "Legacy release must use the approved existing owner and relayer wallet. A newly generated deployer is not permitted."
    );
  }

  return {
    ...control,
    maximumCostWei: BigInt(maximumCostWei),
  };
}