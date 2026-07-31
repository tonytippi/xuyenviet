import { createSchemaCompatibilityConsumer, schemaCompatibilityDeclarations } from "@xuyenviet/contracts";

export async function isWebDeploymentReady(dependencies: {
  assertEnvironment: () => void;
  probeDatabase: () => Promise<void>;
  readReleaseVersions: () => Promise<Array<{ version: unknown }>>;
}): Promise<boolean> {
  try {
    dependencies.assertEnvironment();
    await dependencies.probeDatabase();
    return createSchemaCompatibilityConsumer(schemaCompatibilityDeclarations.web).admits(await dependencies.readReleaseVersions());
  } catch {
    return false;
  }
}
