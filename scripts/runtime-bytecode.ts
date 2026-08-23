type ImmutableReference = {
  start: number;
  length: number;
};

type RuntimeArtifact = {
  deployedBytecode: string;
  immutableReferences?: Record<string, ImmutableReference[]>;
};

type HardhatArtifact = {
  sourceName: string;
  contractName: string;
  deployedBytecode: string;
};

type CompilerBuildInfo = {
  output?: {
    contracts?: Record<
      string,
      Record<
        string,
        {
          evm?: {
            deployedBytecode?: {
              immutableReferences?: Record<string, ImmutableReference[]>;
            };
          };
        }
      >
    >;
  };
};

export function runtimeArtifactFromBuildInfo(
  artifact: HardhatArtifact,
  buildInfo: CompilerBuildInfo | undefined
): RuntimeArtifact {
  const compiledContract =
    buildInfo?.output?.contracts?.[artifact.sourceName]?.[artifact.contractName];
  const immutableReferences = compiledContract?.evm?.deployedBytecode?.immutableReferences;
  if (!compiledContract) {
    throw new Error(
      `Unable to load compiler build-info for ${artifact.sourceName}:${artifact.contractName}.`
    );
  }

  return {
    deployedBytecode: artifact.deployedBytecode,
    immutableReferences,
  };
}

function replaceRange(value: string, start: number, length: number) {
  return `${value.slice(0, start)}${"0".repeat(length)}${value.slice(start + length)}`;
}

export function normalizeRuntimeBytecode(
  runtimeBytecode: string,
  artifact: RuntimeArtifact
) {
  let normalized = runtimeBytecode.toLowerCase();
  if (!normalized.startsWith("0x")) {
    throw new Error("Runtime bytecode must be hex-prefixed.");
  }

  for (const references of Object.values(artifact.immutableReferences ?? {})) {
    for (const { start, length } of references) {
      normalized = replaceRange(normalized, 2 + start * 2, length * 2);
    }
  }

  return normalized;
}

export function assertMatchesCompiledRuntime(
  deployedRuntimeBytecode: string,
  artifact: RuntimeArtifact,
  contractName: string
) {
  const expected = normalizeRuntimeBytecode(artifact.deployedBytecode, artifact);
  const observed = normalizeRuntimeBytecode(deployedRuntimeBytecode, artifact);
  if (expected !== observed) {
    throw new Error(
      `Post-deployment verification failed: ${contractName} runtime bytecode does not match the compiled artifact.`
    );
  }
  return observed;
}