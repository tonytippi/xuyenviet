import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { schema, users } from "../src/db/schema";
import { listQueuedYoutubeSources, parseYoutubeEvidence, recordYoutubeCaptureFailure, saveYoutubeEvidence, type YoutubeCaptureActor } from "../src/features/knowledge/youtube-capture";
import { getDatabaseUrl, getEnvValue } from "./db-env";

type Options = { sourceId?: string; limit?: number; yes: boolean; actorUserId?: string; actorEmail?: string };
const defaultActor = { userId: "system-youtube-capture", email: "system-youtube-capture@xuyenviet.internal" };
export const youtubeEvidencePromptVersion = "youtube-evidence-v1";
const prompt = `Analyze this public YouTube video as a Vietnam road-trip research source. Return JSON only: {"evidence":[{"category":"road_condition|route|toll|fuel|charging|rest_stop|parking|accommodation|food|attraction|safety|weather|cost","claim_vi":"Vietnamese factual claim","evidence_type":"spoken|on_screen|both","timestamp_start_seconds":0,"timestamp_end_seconds":0,"confidence":"high|medium|low","freshness_sensitive":true,"evidence_excerpt":"Maximum 240 characters","uncertainty_or_condition":null}]}. Extract at most 20 items. Include only explicitly spoken or clearly shown facts. Do not infer missing facts or return a transcript. Return {"evidence":[]} if no reliable travel evidence exists.`;

export async function requestYoutubeEvidence(url: string, apiKey: string, model: string, fetchImpl = fetch) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      signal: controller.signal,
      body: JSON.stringify({ contents: [{ parts: [{ file_data: { file_uri: url, mime_type: "video/mp4" } }, { text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }),
    });
    if (!response.ok) throw new Error(`gemini_http_${response.status}`);
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } };
    const text = payload.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;
    if (!text) throw new Error("gemini_empty_response");
    return { evidence: parseYoutubeEvidence(JSON.parse(text) as unknown), latencyMs: Date.now() - startedAt, usage: payload.usageMetadata };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("gemini_timeout");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseArgs(argv: string[]): Options {
  const options: Options = { yes: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--yes" || arg === "-y") options.yes = true;
    else if (arg === "--source-id" || arg === "--limit" || arg === "--actor-user-id" || arg === "--actor-email") {
      const value = argv[++index];
      if (!value || value.startsWith("-")) throw new Error(`${arg} requires a value.`);
      if (arg === "--source-id") options.sourceId = value;
      if (arg === "--limit") { const limit = Number(value); if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new Error("--limit must be an integer between 1 and 25."); options.limit = limit; }
      if (arg === "--actor-user-id") options.actorUserId = value;
      if (arg === "--actor-email") options.actorEmail = value;
    } else if (arg === "--help" || arg === "-h") { console.log("Usage: pnpm youtube:capture [--source-id <id> | --limit <1-25>] [--yes]"); process.exit(0); }
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (Boolean(options.actorUserId) !== Boolean(options.actorEmail)) throw new Error("Provide both --actor-user-id and --actor-email, or omit both.");
  return options;
}

async function resolveActor(db: ReturnType<typeof drizzle<typeof schema>>, options: Options): Promise<YoutubeCaptureActor> {
  const actor = { userId: options.actorUserId ?? getEnvValue("YOUTUBE_CAPTURE_ACTOR_USER_ID") ?? defaultActor.userId, email: options.actorEmail ?? getEnvValue("YOUTUBE_CAPTURE_ACTOR_EMAIL") ?? defaultActor.email };
  const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, actor.userId)).limit(1);
  if (!user || user.email !== actor.email) throw new Error("YouTube capture audit actor not found or email mismatch.");
  return actor;
}

async function confirm(sourceId: string, count: number) {
  const rl = createInterface({ input, output });
  try { return (await rl.question(`Save ${count} bounded evidence item(s) for ${sourceId}? [y/N] `)).trim().toLowerCase() === "y"; } finally { rl.close(); }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apiKey = getEnvValue("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for youtube:capture.");
  const model = getEnvValue("GEMINI_YOUTUBE_MODEL") ?? "gemini-3.5-flash";
  const client = postgres(getDatabaseUrl(), { max: 1 });
  const db = drizzle(client, { schema });
  try {
    const actor = await resolveActor(db, options);
    const queued = await listQueuedYoutubeSources(db, options);
    if (!queued.length) { console.log("No queued YouTube sources need evidence."); return; }
    for (const source of queued) {
      const url = source.canonicalUrl ?? source.url;
      if (!url || !/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{6,20}$/.test(url)) { await recordYoutubeCaptureFailure(db, { sourceId: source.sourceId, reason: "youtube_video_url_required", actor }); console.log(`${source.sourceId}: youtube_video_url_required`); continue; }
      try {
        const result = await requestYoutubeEvidence(url, apiKey, model);
        if (!result.evidence.length) { await recordYoutubeCaptureFailure(db, { sourceId: source.sourceId, reason: "no_travel_evidence", actor }); console.log(`${source.sourceId}: no_travel_evidence`); continue; }
        if (!options.yes && !(await confirm(source.sourceId, result.evidence.length))) { console.log(`${source.sourceId}: skipped`); continue; }
        const saved = await saveYoutubeEvidence(db, { sourceId: source.sourceId, evidence: result.evidence, metadata: { captureMethod: "gemini_youtube_url", capturedAt: new Date().toISOString(), sourceUrl: url, model, promptVersion: youtubeEvidencePromptVersion, evidenceCount: result.evidence.length, latencyMs: result.latencyMs, promptTokens: result.usage?.promptTokenCount, outputTokens: result.usage?.candidatesTokenCount, totalTokens: result.usage?.totalTokenCount }, actor });
        console.log(`${source.sourceId}: ${saved.status}`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "gemini_unknown_error";
        await recordYoutubeCaptureFailure(db, { sourceId: source.sourceId, reason, actor });
        console.log(`${source.sourceId}: ${reason.replace(/[^a-z0-9_.:-]+/gi, "_").slice(0, 120)}`);
      }
    }
  } finally { await client.end(); }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error); process.exit(1); });
