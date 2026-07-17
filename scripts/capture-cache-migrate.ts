import postgres from "postgres";
import { assertDistinctCaptureDatabases, getCaptureCacheDatabaseUrl, getDatabaseUrl } from "./db-env";

const migration = `
create table if not exists capture_cache_meta (key text primary key, value text not null);
create table if not exists capture_artifacts (
  id text primary key, provider text not null check (provider in ('facebook','youtube')), reuse_key text not null,
  resource_identity text not null, capture_method_version text not null, payload_schema_version text not null,
  prompt_version text not null default '', model text not null default '', payload jsonb not null, metadata jsonb not null, content_hash text not null,
  captured_at timestamptz not null, superseded_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (provider, resource_identity, capture_method_version, payload_schema_version, prompt_version, model, content_hash)
);
create index if not exists capture_artifacts_reuse_idx on capture_artifacts (reuse_key, captured_at desc) where superseded_at is null;
create table if not exists capture_artifact_aliases (
  provider text not null check (provider in ('facebook','youtube')), alias_url text not null, resource_identity text not null,
  artifact_id text not null references capture_artifacts(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (provider, alias_url)
);
create table if not exists capture_import_attempts (
  artifact_id text not null references capture_artifacts(id), production_source_id text not null, correlation_token text not null,
  outcome text not null check (outcome in ('awaiting_flush','imported','terminal','retryable')), retry_eligible boolean not null default true,
  lease_owner text, lease_expires_at timestamptz,
  imported_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (artifact_id, production_source_id), unique (correlation_token)
);
alter table capture_import_attempts add column if not exists lease_owner text;
alter table capture_import_attempts add column if not exists lease_expires_at timestamptz;
create table if not exists capture_force_live_artifacts (
  production_source_id text not null, force_generation integer not null check (force_generation > 0),
  artifact_id text not null references capture_artifacts(id), created_at timestamptz not null default now(),
  primary key (production_source_id, force_generation), unique (artifact_id)
);
insert into capture_cache_meta (key, value) values ('schema_version', '2') on conflict (key) do update set value = excluded.value;`;

async function main() {
  const appSql = postgres(getDatabaseUrl(), { max: 1 });
  const sql = postgres(getCaptureCacheDatabaseUrl(), { max: 1 });
  try { await assertDistinctCaptureDatabases(appSql, sql); await sql`select pg_advisory_lock(hashtext('xuyenviet_capture_cache_migration'))`; await sql.unsafe(migration); } finally { await appSql.end(); await sql.end(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "capture cache migration failed"); process.exit(1); });
