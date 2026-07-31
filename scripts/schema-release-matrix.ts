import { createHash } from "node:crypto";
import { realpathSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSchemaReleasePhasePolicy, validatesSchemaReleasePhasePolicy, type SchemaReleasePhasePolicy } from "@xuyenviet/contracts";

const matrixDirectory = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), "../docs/release-matrices"));

export function resolveReleaseMatrixPath(requestedPath: string): string {
  if (!requestedPath || requestedPath !== requestedPath.trim() || requestedPath.startsWith("/") || requestedPath.includes("\\")) {
    throw new Error("release input invalid");
  }
  const candidate = resolve(matrixDirectory, requestedPath);
  const resolved = realpathSync(candidate);
  if (!isPathContainedBy(matrixDirectory, resolved) || !resolved.endsWith(".json")) throw new Error("release input invalid");
  return resolved;
}

export function readReleaseMatrixArtifact(requestedPath: string): unknown {
  try {
    return JSON.parse(readFileSync(resolveReleaseMatrixPath(requestedPath), "utf8"));
  } catch {
    throw new Error("release input invalid");
  }
}

export function readReleaseMatrixArtifactWithDigest(requestedPath: string): { matrix: unknown; digest: string } {
  try {
    const source = readFileSync(resolveReleaseMatrixPath(requestedPath));
    return { matrix: JSON.parse(source.toString("utf8")), digest: createHash("sha256").update(source).digest("hex") };
  } catch {
    throw new Error("release input invalid");
  }
}

// Every runtime consumes the same projection and validates it against the
// immutable checked-in artifact before it can affect readiness.
export function readApprovedReleasePhasePolicy(value = process.env.SCHEMA_RELEASE_PHASE_POLICY): SchemaReleasePhasePolicy | null | undefined {
  if (!value) return undefined;
  try {
    const policy = parseSchemaReleasePhasePolicy(JSON.parse(value));
    if (!policy) return null;
    const { matrix, digest } = readReleaseMatrixArtifactWithDigest(policy.matrixPath);
    return validatesSchemaReleasePhasePolicy(policy, matrix, digest) ? policy : null;
  } catch {
    return null;
  }
}

export function isPathContainedBy(directory: string, candidate: string): boolean {
  const path = relative(directory, candidate);
  return path !== "" && !path.startsWith(`..${sep}`) && path !== ".." && !path.startsWith("/");
}
