import { createHash, generateKeyPairSync } from "node:crypto";
import { createServer, get } from "node:http";
import { cp, mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { readApprovedSchemaReleasePhasePolicy } from "@xuyenviet/config";
import { parseSchemaReleaseMatrix } from "@xuyenviet/contracts";

import { getTestDatabaseUrl } from "./helpers/env-file";

const root = resolve(import.meta.dirname, "..");
const children = new Set<ChildProcess>();

beforeAll(() => {
  const build = spawnSync("pnpm", ["build"], { cwd: root, encoding: "utf8" });
  if (build.status !== 0) throw new Error(build.stderr || build.stdout);
}, 120_000);

afterEach(async () => {
  await Promise.all([...children].map((child) => stop(child)));
  children.clear();
});

describe("bundled workload startup", () => {
  it("admits bundled API, web, and Worker only through an approved digest-bound deployment matrix", async () => {
    const deployment = await mkdtemp(resolve(tmpdir(), "xuyenviet-bundle-"));
    const databaseUrl = getTestDatabaseUrl();
    const sql = postgres(databaseUrl, { max: 1 });
    let originalReleaseVersions: Array<{ version: string }> = [];
    let releaseLedgerCaptured = false;
    try {
      originalReleaseVersions = await sql<{ version: string }[]>`select version from release_schema_versions`;
      releaseLedgerCaptured = true;
      const [{ identity }] = await sql<{ identity: string }[]>`select 'database=' || current_database() || ';host=' || coalesce(host(inet_server_addr()), 'local') || ';port=' || coalesce(inet_server_port()::text, '5432') as identity`;
      await sql`delete from release_schema_versions`;
      await sql`insert into release_schema_versions (version) values ('20260729.1')`;

      const matrixPath = "approved-overlap.json";
      const deployedMatrixDirectory = resolve(deployment, "release-matrices");
      const cwd = resolve(deployment, "process-cwd");
      await Promise.all([mkdir(deployedMatrixDirectory), mkdir(cwd)]);
      await Promise.all([
        cp(resolve(root, "apps/api/dist"), resolve(deployment, "apps/api/dist"), { recursive: true }),
        cp(resolve(root, "apps/worker/dist"), resolve(deployment, "apps/worker/dist"), { recursive: true }),
        cp(resolve(root, ".next"), resolve(deployment, ".next"), { recursive: true }),
        // Materialize dependencies so workspace symlinks cannot reach checkout source.
        cp(resolve(root, "node_modules"), resolve(deployment, "node_modules"), { recursive: true, dereference: true }),
         cp(resolve(root, "package.json"), resolve(deployment, "package.json")),
      ]);
      const approved = approvedMatrix(identity);
      expect(parseSchemaReleaseMatrix(approved)).not.toBeNull();
      const matrix = Buffer.from(JSON.stringify(approved));
      await writeFile(resolve(deployedMatrixDirectory, matrixPath), matrix);
      const policy = JSON.stringify({
        releaseId: "schema-bundled-overlap",
        matrixPath,
        matrixDigest: createHash("sha256").update(matrix).digest("hex"),
        target: approved.target,
        phase: "migrate",
        workloads: approved.phases.migrate.workloads,
      });
      const common = {
        ...process.env,
        DATABASE_URL: databaseUrl,
        SCHEMA_RELEASE_MATRIX_DIRECTORY: deployedMatrixDirectory,
        SCHEMA_RELEASE_PHASE_POLICY: policy,
      };

      expect(readApprovedSchemaReleasePhasePolicy(policy, deployedMatrixDirectory)).not.toBeNull();

      await expectBundledReadiness(deployment, cwd, common, 200);

      await stopChildren();
      await unlink(resolve(deployedMatrixDirectory, matrixPath));
      await expectBundledReadiness(deployment, cwd, common, 503);

      await stopChildren();
      const tampered = structuredClone(approved);
      tampered.verification = ["bundled runtime readiness tampered"];
      expect(parseSchemaReleaseMatrix(tampered)).not.toBeNull();
      await writeFile(resolve(deployedMatrixDirectory, matrixPath), Buffer.from(JSON.stringify(tampered)));
      await expectBundledReadiness(deployment, cwd, common, 503);
    } finally {
      await stopChildren();
      if (releaseLedgerCaptured) {
        await sql`delete from release_schema_versions`;
        if (originalReleaseVersions.length > 0) await sql`insert into release_schema_versions ${sql(originalReleaseVersions)}`;
      }
      await sql.end({ timeout: 5 });
      await rm(deployment, { recursive: true, force: true });
    }
  }, 180_000);
});

async function expectBundledReadiness(deployment: string, cwd: string, common: NodeJS.ProcessEnv, expectedStatus: number) {
  const apiPort = await freePort();
  const workerPort = await freePort();
  const webPort = await freePort();
  const api = launch([resolve(deployment, "apps/api/dist/main.mjs")], cwd, {
    ...common,
    PORT: String(apiPort),
    XV_BFF_CREDENTIAL_CONFIG: JSON.stringify(credentialConfig()),
  });
  const worker = launch([resolve(deployment, "apps/worker/dist/main.mjs")], cwd, { ...common, WORKER_PORT: String(workerPort), WORKER_SUPERVISOR_POLL_MS: "1000" });
  const web = launch([resolve(deployment, "node_modules/next/dist/bin/next"), "start", deployment], cwd, { ...common, PORT: String(webPort), HOSTNAME: "127.0.0.1" });

  await expectLive(apiPort, api);
  await expectLive(workerPort, worker);
  await expectStatus(apiPort, "/health/ready", expectedStatus, api, "API schema admission");
  await expectStatus(workerPort, "/health/ready", expectedStatus, worker, "Worker schema admission");
  await expectStatus(webPort, "/api/health", expectedStatus, web, "web schema admission");
}

function approvedMatrix(identity: string) {
  const workloads = Object.fromEntries(["web", "api", "worker", "migration", "admin"].map((workload) => [workload, { workload, minimumVersion: "20260728.1", maximumVersion: "20260729.1" }]));
  const contractWorkloads = Object.fromEntries(["web", "api", "worker", "migration", "admin"].map((workload) => [workload, { workload, minimumVersion: "20260729.1", maximumVersion: "20260729.1" }]));
  const owners = ["web", "api", "worker", "migration"].map((workload) => ({ id: `${workload}-expanded`, ownerType: "workload", workload, role: "reader", oldRepresentation: `${workload}-expand`, schemaVersion: "20260728.1", effectiveState: "active", deploymentEvidence: `${workload} deployment verified`, declaration: workloads[workload] }));
  const writer = { id: "api-request-write", ownerType: "capability", capability: "api.request-write", runtimeWorkload: "api", role: "writer", oldRepresentation: "api-request-write-expand", schemaVersion: "20260728.1", effectiveState: "active", deploymentEvidence: "API writer deployment verified", declaration: workloads.api };
  const allOwners = [...owners, writer];
  return {
    releaseId: "schema-bundled-overlap", disposition: "expand_migrate_contract",
    target: { environment: "test", identityClass: "test", resolvedIdentity: identity }, approval: { approved: true, reference: "bundled-runtime-test" },
    currentVersion: "20260728.1", targetVersion: "20260729.1", operation: { phase: "migrate", durableRewrite: false }, persistentObjects: [{ name: "release_schema_versions", interpretation: "expanded representation" }],
    phases: { expand: { workloads }, migrate: { workloads }, contract: { workloads: contractWorkloads } },
    activeOwnerInventory: { attested: true, owners: allOwners }, expandEvidence: Object.fromEntries(allOwners.map((owner) => [owner.id, owner.deploymentEvidence])),
    rolloutOrder: [...allOwners.map((owner) => owner.id), "verify-expand", "migrate"], migrationJob: { version: "20260729.1", lock: "918_040_004" }, migrationPlan: { disposition: "forward_only", pending: [] },
    traffic: { writerOwnerId: writer.id, dualWrite: false, readOnlyShadow: false }, rollback: { legacyOwnerId: writer.id, legacyBinaryRelease: writer.oldRepresentation }, verification: ["bundled runtime readiness verified"],
    contract: { destructiveCleanup: false, oldOwners: allOwners.map((owner) => ({ id: owner.id, oldRepresentation: owner.oldRepresentation, schemaVersion: owner.schemaVersion, retired: false })) },
  };
}

function launch(args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const child = spawn("node", args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout?.on("data", (chunk) => { output += chunk; });
  child.stderr?.on("data", (chunk) => { output += chunk; });
  (child as ChildProcess & { output?: () => string }).output = () => output;
  children.add(child);
  return child;
}

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function expectLive(port: number, child: ChildProcess & { output?: () => string }) {
  await expectStatus(port, "/health/live", 200, child, "live");
}

async function expectStatus(port: number, path: string, expectedStatus: number, child: ChildProcess & { output?: () => string }, state: string) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const status = await new Promise<number>((resolve, reject) => get(`http://127.0.0.1:${port}${path}`, (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode ?? 0));
      }).once("error", reject));
      if (status === expectedStatus) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Runtime did not become ${state} on port ${port}: ${child.output?.() ?? "no output"}`);
}

function credentialConfig() {
  const publicKey = generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey.export({ format: "jwk" });
  const key = { ...publicKey, kid: "bundle-test", kty: "EC", crv: "P-256" };
  return {
    audience: "api.railway.internal",
    maxLifetimeSeconds: 60,
    issuers: {
      "xuyenviet-web-bff": { issuer: "xuyenviet-web-bff", active: { kid: "bundle-test", key } },
      "xuyenviet-admin-bff": { issuer: "xuyenviet-admin-bff", active: { kid: "bundle-test", key } },
    },
  };
}

function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const force = setTimeout(() => { child.kill("SIGKILL"); }, 2_000);
    child.once("exit", () => { clearTimeout(force); resolve(); });
    child.kill("SIGTERM");
  });
}

async function stopChildren() {
  await Promise.all([...children].map((child) => stop(child)));
  children.clear();
}
