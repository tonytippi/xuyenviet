import { readApprovedSchemaReleasePhasePolicy } from "@xuyenviet/config";
import { admitsSchemaReleasePhasePolicy, createSchemaCompatibilityConsumer, schemaCompatibilityDeclarations, type SchemaReleasePhasePolicy } from "@xuyenviet/contracts";

export async function isWebDeploymentReady(dependencies: {
  assertEnvironment: () => void;
  probeDatabase: () => Promise<void>;
  readReleaseVersions: () => Promise<Array<{ version: unknown }>>;
  readReleaseAdmission?: () => Promise<{ rows: Array<{ version: unknown }>; resolvedTargetIdentity: string }>;
  releasePhasePolicy?: SchemaReleasePhasePolicy | null;
}): Promise<boolean> {
  try {
    dependencies.assertEnvironment();
    await dependencies.probeDatabase();
    const admission = dependencies.releasePhasePolicy === undefined ? undefined : await dependencies.readReleaseAdmission?.();
    const rows = admission?.rows ?? await dependencies.readReleaseVersions();
    return createSchemaCompatibilityConsumer(schemaCompatibilityDeclarations.web).admits(rows)
      && admitsSchemaReleasePhasePolicy(dependencies.releasePhasePolicy, "web", rows, admission?.resolvedTargetIdentity);
  } catch {
    return false;
  }
}

export function readWebReleasePhasePolicy(value = process.env.SCHEMA_RELEASE_PHASE_POLICY): SchemaReleasePhasePolicy | null | undefined {
  return readApprovedSchemaReleasePhasePolicy(value);
}
