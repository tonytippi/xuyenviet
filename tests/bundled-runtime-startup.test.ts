import { createHash, generateKeyPairSync } from "node:crypto";
import { createServer, get } from "node:http";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

import { afterEach, beforeAll, describe, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const matrixDirectory = resolve(root, "docs/release-matrices");
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
  it("starts API, Worker, and web bundles outside the repository with deployment-owned release artifacts", async () => {
    const deployment = await mkdtemp(resolve(tmpdir(), "xuyenviet-bundle-"));
    try {
      const matrixPath = "20260728.1-to-20260729.1.json";
      const matrix = await readFile(resolve(matrixDirectory, matrixPath));
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
      const parsed = JSON.parse(matrix.toString("utf8"));
      await writeFile(resolve(deployedMatrixDirectory, matrixPath), matrix);
      const policy = JSON.stringify({
        releaseId: parsed.releaseId,
        matrixPath,
        matrixDigest: createHash("sha256").update(matrix).digest("hex"),
        target: parsed.target,
        phase: "migrate",
        workloads: parsed.phases.migrate.workloads,
      });
      const apiPort = await freePort();
      const workerPort = await freePort();
      const webPort = await freePort();
      const common = {
        ...process.env,
        DATABASE_URL: "postgresql://runtime:runtime@127.0.0.1:1/xuyenviet",
        SCHEMA_RELEASE_MATRIX_DIRECTORY: deployedMatrixDirectory,
        SCHEMA_RELEASE_PHASE_POLICY: policy,
      };
      const api = launch([resolve(deployment, "apps/api/dist/main.mjs")], cwd, {
        ...common,
        PORT: String(apiPort),
        XV_BFF_CREDENTIAL_CONFIG: JSON.stringify(credentialConfig()),
      });
      const worker = launch([resolve(deployment, "apps/worker/dist/main.mjs")], cwd, { ...common, WORKER_PORT: String(workerPort) });
      const web = launch([resolve(deployment, "node_modules/next/dist/bin/next"), "start", deployment], cwd, { ...common, PORT: String(webPort), HOSTNAME: "127.0.0.1" });

      await expectLive(apiPort, api);
      await expectLive(workerPort, worker);
      await expectStatus(webPort, "/api/health", 503, web, "web health endpoint");
    } finally {
      await rm(deployment, { recursive: true, force: true });
    }
  }, 120_000);
});

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
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 2_000).unref();
  });
}
