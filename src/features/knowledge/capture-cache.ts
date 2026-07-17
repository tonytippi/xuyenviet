import { createHash, randomUUID } from "node:crypto";
import type postgres from "postgres";

export type CaptureArtifact = {
  id: string;
  provider: "facebook" | "youtube";
  reuseKey: string;
  resourceIdentity: string;
  captureMethodVersion: string;
  payloadSchemaVersion: string;
  promptVersion: string | null;
  model: string | null;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  contentHash: string;
  capturedAt: string;
};

type CacheSql = postgres.Sql<Record<string, unknown>>;
const unsafeKey = /cookie|token|password|local_?storage|html|profile|prompt|response|error.?body|secret/i;
const MAX_CACHE_DEPTH = 8;
const MAX_CACHE_OBJECT_KEYS = 100;
const MAX_CACHE_ARRAY_ITEMS = 100;
const MAX_CACHE_STRING_LENGTH = 20_000;
const MAX_CACHE_PAYLOAD_BYTES = 200_000;

export function sanitizeCacheValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_CACHE_DEPTH) return undefined;
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, MAX_CACHE_STRING_LENGTH);
  if (Array.isArray(value)) return value.slice(0, MAX_CACHE_ARRAY_ITEMS).map((item) => sanitizeCacheValue(item, depth + 1)).filter((item) => item !== undefined);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, MAX_CACHE_OBJECT_KEYS).flatMap(([key, item]) => unsafeKey.test(key) ? [] : [[key, sanitizeCacheValue(item, depth + 1)] as const]).filter(([, item]) => item !== undefined));
  }
  return undefined;
}

export function artifactHash(payload: Record<string, unknown>) {
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}

export function isArtifactContentValid(payload: unknown, contentHash: string) {
  return Boolean(payload && typeof payload === "object" && !Array.isArray(payload) && artifactHash(payload as Record<string, unknown>) === contentHash);
}

export async function assertCaptureCacheReady(sql: CacheSql) {
  const [marker] = await sql`select value from capture_cache_meta where key = 'schema_version'`;
  if (marker?.value !== "2") throw new Error("Capture cache is not initialized or is incompatible. Run pnpm capture-cache:migrate.");
}

export async function findReusableArtifact(sql: CacheSql, reuseKey: string): Promise<CaptureArtifact | null> {
  const [row] = await sql`select id, provider, reuse_key, resource_identity, capture_method_version, payload_schema_version, prompt_version, model, payload, metadata, content_hash, captured_at from capture_artifacts where reuse_key = ${reuseKey} and superseded_at is null order by captured_at desc, created_at desc limit 1`;
  return row && isArtifactContentValid(row.payload, String(row.content_hash)) ? rowToArtifact(row) : null;
}

export async function findArtifactByAlias(sql: CacheSql, input: {
  provider: CaptureArtifact["provider"];
  aliasUrl: string;
  resourceIdentity: string;
  captureMethodVersion: string;
  payloadSchemaVersion: string;
  allowValidatedAlias?: boolean;
}): Promise<CaptureArtifact | null> {
  const [row] = await sql`select a.id, a.provider, a.reuse_key, a.resource_identity, a.capture_method_version, a.payload_schema_version, a.prompt_version, a.model, a.payload, a.metadata, a.content_hash, a.captured_at from capture_artifact_aliases x join capture_artifacts a on a.id = x.artifact_id where x.provider = ${input.provider} and x.alias_url = ${input.aliasUrl} and a.capture_method_version = ${input.captureMethodVersion} and a.payload_schema_version = ${input.payloadSchemaVersion} and (a.resource_identity = ${input.resourceIdentity} or (${input.allowValidatedAlias ?? false} and x.resource_identity = a.resource_identity)) and a.superseded_at is null order by a.captured_at desc limit 1`;
  const artifact = row && isArtifactContentValid(row.payload, String(row.content_hash)) ? rowToArtifact(row) : null;
  return artifact && isAliasCompatible(artifact, input) ? artifact : null;
}

export function isAliasCompatible(artifact: CaptureArtifact, input: Pick<Parameters<typeof findArtifactByAlias>[1], "provider" | "resourceIdentity" | "captureMethodVersion" | "payloadSchemaVersion" | "allowValidatedAlias">) {
  return artifact.provider === input.provider
    && artifact.captureMethodVersion === input.captureMethodVersion
    && artifact.payloadSchemaVersion === input.payloadSchemaVersion
    && (artifact.resourceIdentity === input.resourceIdentity || (input.allowValidatedAlias === true && input.resourceIdentity.startsWith("submitted:")));
}

export async function admitArtifact(sql: CacheSql, input: Omit<CaptureArtifact, "id" | "contentHash">): Promise<CaptureArtifact> {
  const payload = sanitizeCacheValue(input.payload) as Record<string, unknown>;
  const metadata = sanitizeCacheValue(input.metadata) as Record<string, unknown>;
  if (!payload || Array.isArray(payload) || Buffer.byteLength(JSON.stringify(payload), "utf8") > MAX_CACHE_PAYLOAD_BYTES) throw new Error("capture_artifact_payload_too_large");
  const contentHash = artifactHash(payload);
  const id = randomUUID();
  const [row] = await sql`insert into capture_artifacts (id, provider, reuse_key, resource_identity, capture_method_version, payload_schema_version, prompt_version, model, payload, metadata, content_hash, captured_at) values (${id}, ${input.provider}, ${input.reuseKey}, ${input.resourceIdentity}, ${input.captureMethodVersion}, ${input.payloadSchemaVersion}, ${input.promptVersion ?? ""}, ${input.model ?? ""}, ${JSON.stringify(payload)}::jsonb, ${JSON.stringify(metadata)}::jsonb, ${contentHash}, ${input.capturedAt}::timestamptz) on conflict (provider, resource_identity, capture_method_version, payload_schema_version, prompt_version, model, content_hash) do update set updated_at = now() returning id, provider, reuse_key, resource_identity, capture_method_version, payload_schema_version, prompt_version, model, payload, metadata, content_hash, captured_at`;
  return rowToArtifact(row);
}

export async function admitArtifactAlias(sql: CacheSql, input: { artifactId: string; provider: CaptureArtifact["provider"]; aliasUrl: string; resourceIdentity: string }) {
  await sql`insert into capture_artifact_aliases (provider, alias_url, resource_identity, artifact_id) values (${input.provider}, ${input.aliasUrl}, ${input.resourceIdentity}, ${input.artifactId}) on conflict (provider, alias_url) do update set resource_identity = excluded.resource_identity, artifact_id = excluded.artifact_id, updated_at = now()`;
}

export async function supersedeDefaultArtifacts(sql: CacheSql, artifact: CaptureArtifact) {
  await sql`update capture_artifacts set superseded_at = now(), updated_at = now() where provider = ${artifact.provider} and resource_identity = ${artifact.resourceIdentity} and id <> ${artifact.id} and superseded_at is null`;
}

export type CaptureImportAttempt = {
  correlationToken: string;
  outcome: "awaiting_flush" | "imported" | "terminal" | "retryable";
  ownsLease: boolean;
  leaseOwner: string | null;
};

export async function prepareImport(sql: CacheSql, artifactId: string, sourceId: string): Promise<CaptureImportAttempt> {
  const correlationToken = randomUUID();
  const leaseOwner = randomUUID();
  const [acquired] = await sql`insert into capture_import_attempts (artifact_id, production_source_id, correlation_token, outcome, retry_eligible, lease_owner, lease_expires_at) values (${artifactId}, ${sourceId}, ${correlationToken}, 'awaiting_flush', true, ${leaseOwner}, now() + interval '5 minutes') on conflict (artifact_id, production_source_id) do update set lease_owner = excluded.lease_owner, lease_expires_at = excluded.lease_expires_at, updated_at = now(), correlation_token = case when capture_import_attempts.outcome in ('imported', 'terminal') then excluded.correlation_token else capture_import_attempts.correlation_token end, outcome = case when capture_import_attempts.outcome in ('imported', 'terminal') then 'awaiting_flush' else capture_import_attempts.outcome end, retry_eligible = case when capture_import_attempts.outcome in ('imported', 'terminal') then true else capture_import_attempts.retry_eligible end where capture_import_attempts.lease_expires_at is null or capture_import_attempts.lease_expires_at < now() or capture_import_attempts.outcome in ('imported', 'terminal') returning correlation_token, outcome`;
  if (acquired) return { correlationToken: String(acquired.correlation_token), outcome: acquired.outcome as CaptureImportAttempt["outcome"], ownsLease: true, leaseOwner };
  const [existing] = await sql`select correlation_token, outcome from capture_import_attempts where artifact_id = ${artifactId} and production_source_id = ${sourceId}`;
  if (!existing) throw new Error("capture_import_attempt_missing");
  return { correlationToken: String(existing.correlation_token), outcome: existing.outcome as CaptureImportAttempt["outcome"], ownsLease: false, leaseOwner: null };
}

export async function hasRetryableImport(sql: CacheSql, artifactId: string, sourceId: string) {
  const [row] = await sql`select 1 as found from capture_import_attempts where artifact_id = ${artifactId} and production_source_id = ${sourceId} and outcome in ('awaiting_flush', 'retryable')`;
  return Boolean(row);
}

export async function finishImport(sql: CacheSql, artifactId: string, sourceId: string, correlationToken: string, leaseOwner: string, outcome: "imported" | "terminal" | "retryable") {
  await sql`update capture_import_attempts set outcome = ${outcome}, retry_eligible = ${outcome === "retryable"}, lease_owner = null, lease_expires_at = null, imported_at = case when ${outcome} = 'imported' then now() else imported_at end, updated_at = now() where artifact_id = ${artifactId} and production_source_id = ${sourceId} and correlation_token = ${correlationToken} and lease_owner = ${leaseOwner} and lease_expires_at >= now()`;
}

export async function linkForceLiveArtifact(sql: CacheSql, sourceId: string, forceGeneration: number, artifactId: string) {
  const [linked] = await sql`insert into capture_force_live_artifacts (production_source_id, force_generation, artifact_id) values (${sourceId}, ${forceGeneration}, ${artifactId}) on conflict (production_source_id, force_generation) do nothing returning artifact_id`;
  if (linked) return artifactId;
  const [existing] = await sql`select artifact_id from capture_force_live_artifacts where production_source_id = ${sourceId} and force_generation = ${forceGeneration}`;
  if (!existing) throw new Error("capture_force_live_artifact_missing");
  return String(existing.artifact_id);
}

export async function findForceLiveArtifact(sql: CacheSql, sourceId: string, forceGeneration: number): Promise<CaptureArtifact | null> {
  const [row] = await sql`select a.id, a.provider, a.reuse_key, a.resource_identity, a.capture_method_version, a.payload_schema_version, a.prompt_version, a.model, a.payload, a.metadata, a.content_hash, a.captured_at from capture_force_live_artifacts f join capture_artifacts a on a.id = f.artifact_id where f.production_source_id = ${sourceId} and f.force_generation = ${forceGeneration}`;
  return row && isArtifactContentValid(row.payload, String(row.content_hash)) ? rowToArtifact(row) : null;
}

function rowToArtifact(row: Record<string, unknown>): CaptureArtifact {
  return { id: String(row.id), provider: row.provider as CaptureArtifact["provider"], reuseKey: String(row.reuse_key), resourceIdentity: String(row.resource_identity), captureMethodVersion: String(row.capture_method_version), payloadSchemaVersion: String(row.payload_schema_version), promptVersion: row.prompt_version ? String(row.prompt_version) : null, model: row.model ? String(row.model) : null, payload: row.payload as Record<string, unknown>, metadata: row.metadata as Record<string, unknown>, contentHash: String(row.content_hash), capturedAt: new Date(String(row.captured_at)).toISOString() };
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
}
