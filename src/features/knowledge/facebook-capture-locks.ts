import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { schema } from "../../db/schema";

type FacebookCaptureLockDb = Pick<PostgresJsDatabase<typeof schema>, "execute">;

const FACEBOOK_CAPTURE_LOCK_NAMESPACE = 1_179_990_092;

type FacebookCaptureLockId = {
  namespace: number;
  resourceId: number;
};

function facebookCaptureLockResourceKeys(input: { sourceId?: string; canonicalUrls?: Array<string | null | undefined> }) {
  return Array.from(new Set([
    input.sourceId ? `facebook-capture:source:${input.sourceId}` : null,
    ...(input.canonicalUrls ?? []).flatMap((url) => (url ? [`facebook-capture:url:${url}`] : [])),
  ].filter((key): key is string => key !== null)));
}

function stableFacebookCaptureLockHash(key: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash | 0;
}

export function facebookCaptureLockIds(input: { sourceId?: string; canonicalUrls?: Array<string | null | undefined> }): FacebookCaptureLockId[] {
  // PostgreSQL identifies this two-int advisory lock by these values, not by the resource key.
  // Deduplicating after hashing prevents a collision from creating a different lock order.
  return Array.from(new Set(facebookCaptureLockResourceKeys(input).map(stableFacebookCaptureLockHash)))
    .sort((left, right) => left - right)
    .map((resourceId) => ({ namespace: FACEBOOK_CAPTURE_LOCK_NAMESPACE, resourceId }));
}

export async function lockFacebookCaptureResources(db: FacebookCaptureLockDb, input: { sourceId?: string; canonicalUrls?: Array<string | null | undefined> }) {
  for (const lock of facebookCaptureLockIds(input)) {
    await db.execute(sql`select pg_advisory_xact_lock(${lock.namespace}::integer, ${lock.resourceId}::integer)`);
  }
}
