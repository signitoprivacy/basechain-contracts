import { expect } from "chai";
import { artifacts, ethers } from "hardhat";
import {
  assertMainnetDeploymentRequest,
  assertLegacyMainnetDeploymentRequest,
  assertTestDeploymentRequest,
  LEGACY_MAINNET_OPERATOR_ADDRESS,
  getMainnetNetworkControl,
  getTestNetworkControl,
} from "../scripts/release-controls";
import {
  assertMatchesCompiledRuntime,
  normalizeRuntimeBytecode,
  runtimeArtifactFromBuildInfo,
} from "../scripts/runtime-bytecode";

const amount = ethers.parseEther("1");

async function deployStandardSignito() {
  const [owner, relayer, user, stoken, recipient, decoy] = await ethers.getSigners();
  const shieldedEth = await (await ethers.getContractFactory("ShieldedETH", owner)).deploy();
  const pool = await (
    await ethers.getContractFactory("SignitoPool", owner)
  ).deploy(await shieldedEth.getAddress(), relayer.address);

  await shieldedEth.connect(owner).setPool(await pool.getAddress());

  return { owner, relayer, user, stoken, recipient, decoy, shieldedEth, pool };
}

describe("Standard Signito", () => {
  it("shields value into a private stoken address and disables transfers", async () => {
    const { user, stoken, shieldedEth, pool } = await deployStandardSignito();
    const otsPreimage = ethers.id("shield-ots-preimage");
    const otsTip = ethers.keccak256(otsPreimage);

    await expect(pool.connect(user).shield(stoken.address, otsTip, 2, { value: amount }))
      .to.emit(pool, "Shielded")
      .withArgs(stoken.address, amount);

    const state = await pool.getUserState(stoken.address);
    expect(state[0]).to.equal(otsTip);
    expect(state[1]).to.equal(2);
    expect(state[2]).to.equal(amount);
    expect(state[3]).to.equal(true);
    expect(await shieldedEth.balanceOf(stoken.address)).to.equal(amount);
    expect(await shieldedEth.balanceOf(user.address)).to.equal(amount);
    await expect(shieldedEth.connect(user).transfer(stoken.address, 1)).to.be.revertedWith(
      "sETH: non-transferable"
    );
  });

  it("supports single-transaction shielding with decoys", async () => {
    const { user, stoken, decoy, shieldedEth, pool } = await deployStandardSignito();
    const otsTip = ethers.keccak256(ethers.id("decoy-ots-preimage"));

    await pool
      .connect(user)
      .shieldWithDecoys(stoken.address, otsTip, 3, [stoken.address, user.address, decoy.address], {
        value: amount,
      });

    expect(await shieldedEth.balanceOf(stoken.address)).to.equal(amount);
    expect(await shieldedEth.balanceOf(user.address)).to.equal(amount);
    expect(await shieldedEth.balanceOf(decoy.address)).to.equal(amount);
    expect((await pool.getUserState(stoken.address))[2]).to.equal(amount);
  });

  it("burns with a valid OTS preimage then processes a separate queue payment", async () => {
    const { relayer, user, stoken, recipient, pool } = await deployStandardSignito();
    const otsPreimage = ethers.id("burn-ots-preimage");
    const otsTip = ethers.keccak256(otsPreimage);

    await pool.connect(user).shield(stoken.address, otsTip, 2, { value: amount });
    await pool.connect(relayer).burnAndQueue(amount, otsPreimage, [stoken.address, user.address]);

    const afterBurn = await pool.getUserState(stoken.address);
    expect(afterBurn[1]).to.equal(1);
    expect(afterBurn[2]).to.equal(0);
    expect(afterBurn[0]).to.equal(otsPreimage);

    const recipientBefore = await ethers.provider.getBalance(recipient.address);
    const fee = (amount * 15n) / 10_000n;
    await pool.connect(relayer).processQueue(recipient.address, amount);
    expect(await ethers.provider.getBalance(recipient.address)).to.equal(recipientBefore + amount - fee);
  });

  it("refreshes an OTS chain only through the authorized relayer", async () => {
    const { relayer, user, stoken, pool } = await deployStandardSignito();
    const currentPreimage = ethers.id("refresh-current-preimage");
    const currentTip = ethers.keccak256(currentPreimage);
    const newTip = ethers.keccak256(ethers.id("refresh-new-preimage"));

    await pool.connect(user).shield(stoken.address, currentTip, 2, { value: amount });
    await expect(
      pool.connect(user).refreshOts(stoken.address, currentPreimage, newTip, 4)
    ).to.be.revertedWith("not relayer");

    await pool.connect(relayer).refreshOts(stoken.address, currentPreimage, newTip, 4);
    const refreshed = await pool.getUserState(stoken.address);
    expect(refreshed[0]).to.equal(newTip);
    expect(refreshed[1]).to.equal(4);
  });

  it("creates and claims an AirSign escrow with a valid EIP-191 signature", async () => {
    const { relayer, user, stoken, recipient, pool } = await deployStandardSignito();
    const otsPreimage = ethers.id("airsign-ots-preimage");
    const otsTip = ethers.keccak256(otsPreimage);
    const nonceHash = ethers.id("airsign-nonce");

    await pool.connect(user).shield(stoken.address, otsTip, 2, { value: amount });
    await pool
      .connect(relayer)
      .mintAirsign(nonceHash, amount, stoken.address, otsPreimage, user.address);

    const messageHash = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "address", "uint256"], [nonceHash, recipient.address, amount])
    );
    const signature = await user.signMessage(ethers.getBytes(messageHash));

    await expect(pool.connect(relayer).claimAirsign(nonceHash, recipient.address, signature))
      .to.emit(pool, "AirsignClaimed")
      .withArgs(nonceHash, recipient.address, amount);
  });

  it("rejects wrong relayer and invalid OTS authorizations", async () => {
    const { relayer, user, stoken, pool } = await deployStandardSignito();
    const validPreimage = ethers.id("valid-ots-preimage");
    const validTip = ethers.keccak256(validPreimage);
    const wrongPreimage = ethers.id("wrong-ots-preimage");

    await pool.connect(user).shield(stoken.address, validTip, 2, { value: amount });
    await expect(
      pool.connect(user).burnAndQueue(amount, validPreimage, [stoken.address, user.address])
    ).to.be.revertedWith("not relayer");
    await expect(
      pool.connect(relayer).burnAndQueue(amount, wrongPreimage, [stoken.address, user.address])
    ).to.be.revertedWith("no valid OTS in array");
  });
});

describe("Phase 2 release controls", () => {
  const deployer = "0x0000000000000000000000000000000000000001";
  const relayer = "0x0000000000000000000000000000000000000002";
  const fundingApprovalReference = "approved-testnet-funding";

  function approvedRoles(overrides = {}) {
    return {
      approvedDeployerAddress: deployer,
      approvedRelayerAddress: relayer,
      fundingApprovalReference,
      ...overrides,
    };
  }

  it("accepts only a confirmed Base Sepolia deployment with separate roles", () => {
    expect(
      assertTestDeploymentRequest({
        networkName: "base-sepolia",
        chainId: 84532n,
        confirmation: "BASE_SEPOLIA_FRESH_STANDARD_SIGNITO",
        deployerAddress: deployer,
        relayerAddress: relayer,
        ...approvedRoles(),
      }).relayerEnv
    ).to.equal("BASE_SEPOLIA_RELAYER_ADDRESS");
  });

  it("rejects mainnet, wrong chains, missing confirmation, and shared roles", () => {
    expect(() => getTestNetworkControl("base-mainnet")).to.throw("Phase 2 only permits");
    expect(() =>
      assertTestDeploymentRequest({
        networkName: "base-sepolia",
        chainId: 8453n,
        confirmation: "BASE_SEPOLIA_FRESH_STANDARD_SIGNITO",
        deployerAddress: deployer,
        relayerAddress: relayer,
        ...approvedRoles(),
      })
    ).to.throw("Wrong chain");
    expect(() =>
      assertTestDeploymentRequest({
        networkName: "ethereum-sepolia",
        chainId: 11155111n,
        confirmation: undefined,
        deployerAddress: deployer,
        relayerAddress: relayer,
        ...approvedRoles(),
      })
    ).to.throw("Deployment confirmation missing");
    expect(() =>
      assertTestDeploymentRequest({
        networkName: "ethereum-sepolia",
        chainId: 11155111n,
        confirmation: "ETHEREUM_SEPOLIA_FRESH_STANDARD_SIGNITO",
        deployerAddress: deployer,
        relayerAddress: deployer,
        ...approvedRoles({ approvedRelayerAddress: deployer }),
      })
    ).to.throw("separate approved operational roles");
    expect(() =>
      assertTestDeploymentRequest({
        networkName: "base-sepolia",
        chainId: 84532n,
        confirmation: "BASE_SEPOLIA_FRESH_STANDARD_SIGNITO",
        deployerAddress: deployer,
        relayerAddress: relayer,
        ...approvedRoles({
          approvedDeployerAddress: "0x0000000000000000000000000000000000000003",
        }),
      })
    ).to.throw("does not match the approved operational deployer");
    expect(() =>
      assertTestDeploymentRequest({
        networkName: "base-sepolia",
        chainId: 84532n,
        confirmation: "BASE_SEPOLIA_FRESH_STANDARD_SIGNITO",
        deployerAddress: deployer,
        relayerAddress: relayer,
        ...approvedRoles({ fundingApprovalReference: undefined }),
      })
    ).to.throw("funding approval reference");
  });

  it("permits only a separately approved Mainnet preflight with a positive cost cap", () => {
    expect(
      assertMainnetDeploymentRequest({
        networkName: "base-mainnet",
        chainId: 8453n,
        confirmation: "BASE_MAINNET_FRESH_STANDARD_SIGNITO",
        deployerAddress: deployer,
        relayerAddress: relayer,
        ...approvedRoles({ fundingApprovalReference: "approved-mainnet-funding" }),
        maximumCostWei: "10000000000000000",
      }).maxCostWeiEnv
    ).to.equal("BASE_MAINNET_MAX_DEPLOYMENT_COST_WEI");
    expect(() => getMainnetNetworkControl("base-sepolia")).to.throw("Only Base Mainnet");
    expect(() =>
      assertMainnetDeploymentRequest({
        networkName: "ethereum-mainnet",
        chainId: 1n,
        confirmation: "ETHEREUM_MAINNET_FRESH_STANDARD_SIGNITO",
        deployerAddress: deployer,
        relayerAddress: deployer,
        ...approvedRoles({
          approvedRelayerAddress: deployer,
          fundingApprovalReference: "approved-mainnet-funding",
        }),
        maximumCostWei: "50000000000000000",
      })
    ).to.throw("separate approved operational roles");
    expect(() =>
      assertMainnetDeploymentRequest({
        networkName: "base-mainnet",
        chainId: 8453n,
        confirmation: "BASE_MAINNET_FRESH_STANDARD_SIGNITO",
        deployerAddress: deployer,
        relayerAddress: relayer,
        ...approvedRoles({ fundingApprovalReference: "approved-mainnet-funding" }),
        maximumCostWei: "0",
      })
    ).to.throw("positive wei-denominated deployment cap");
  });

  it("permits the explicitly selected legacy Ethereum operator and rejects substitutions", () => {
    expect(
      assertLegacyMainnetDeploymentRequest({
        networkName: "ethereum-mainnet",
        chainId: 1n,
        confirmation: "ETHEREUM_MAINNET_LEGACY_STANDARD_SIGNITO",
        deployerAddress: LEGACY_MAINNET_OPERATOR_ADDRESS,
        relayerAddress: LEGACY_MAINNET_OPERATOR_ADDRESS,
        approvedDeployerAddress: LEGACY_MAINNET_OPERATOR_ADDRESS,
        approvedRelayerAddress: LEGACY_MAINNET_OPERATOR_ADDRESS,
        fundingApprovalReference: "legacy-wallet-funded",
        maximumCostWei: "50000000000000000",
      }).maxCostWeiEnv
    ).to.equal("ETHEREUM_MAINNET_LEGACY_MAX_DEPLOYMENT_COST_WEI");
    expect(() =>
      assertLegacyMainnetDeploymentRequest({
        networkName: "ethereum-mainnet",
        chainId: 1n,
        confirmation: "ETHEREUM_MAINNET_LEGACY_STANDARD_SIGNITO",
        deployerAddress: deployer,
        relayerAddress: LEGACY_MAINNET_OPERATOR_ADDRESS,
        approvedDeployerAddress: LEGACY_MAINNET_OPERATOR_ADDRESS,
        approvedRelayerAddress: LEGACY_MAINNET_OPERATOR_ADDRESS,
        fundingApprovalReference: "legacy-wallet-funded",
        maximumCostWei: "50000000000000000",
      })
    ).to.throw("approved existing owner and relayer wallet");
  });

  it("compares runtime bytecode while masking only immutable constructor slots", () => {
    const artifact = {
      deployedBytecode: "0x112233445566",
      immutableReferences: { shETH: [{ start: 1, length: 2 }] },
    };
    expect(normalizeRuntimeBytecode("0x11aabb445566", artifact)).to.equal("0x110000445566");
    expect(assertMatchesCompiledRuntime("0x112233445566", artifact, "Example")).to.equal(
      "0x110000445566"
    );
    expect(() => assertMatchesCompiledRuntime("0x11aabb4477ff", artifact, "Example")).to.throw(
      "runtime bytecode does not match"
    );
  });

  it("matches a real SignitoPool deployment using compiler immutable metadata", async () => {
    const { shieldedEth, pool } = await deployStandardSignito();
    const poolArtifact = await artifacts.readArtifact("SignitoPool");
    const poolBuildInfo = await artifacts.getBuildInfo(
      `${poolArtifact.sourceName}:${poolArtifact.contractName}`
    );
    const runtimeArtifact = runtimeArtifactFromBuildInfo(poolArtifact, poolBuildInfo);
    const poolRuntime = await ethers.provider.getCode(await pool.getAddress());
    const shieldedEthRuntime = await ethers.provider.getCode(await shieldedEth.getAddress());

    expect(runtimeArtifact.immutableReferences).to.not.deep.equal({});
    expect(assertMatchesCompiledRuntime(poolRuntime, runtimeArtifact, "SignitoPool")).to.equal(
      normalizeRuntimeBytecode(poolRuntime, runtimeArtifact)
    );

    const changedFirstByte = poolRuntime.slice(2, 4) === "00" ? "01" : "00";
    const mutatedPoolRuntime = `0x${changedFirstByte}${poolRuntime.slice(4)}`;
    expect(() =>
      assertMatchesCompiledRuntime(mutatedPoolRuntime, runtimeArtifact, "SignitoPool")
    ).to.throw("runtime bytecode does not match");
    expect(shieldedEthRuntime).to.not.equal("0x");
  });
});