import { and, desc, eq, sql } from "drizzle-orm";
import { adminYoutubeCapturePageSize, type AdminYoutubeCapture, type AdminYoutubeCaptureDetail, type AdminYoutubeCaptureEvidence, type AdminYoutubeCaptureQueue } from "@xuyenviet/contracts";
import type { AdminYoutubeCapturePort } from "@xuyenviet/domain";
import { getDb } from "./client";
import { knowledgeIngestionJobs, sourceCaptureVersions, sources } from "./schema";

const unsafe = /cookie|token|secret|password|provider\s*payload|provider[_-]?payload|prompt|response|<html|<!doctype/i;
const stages = ["queued", "triaging", "extracting", "judging", "relating", "published", "suppressed", "review_recommended", "verify_first", "failed"] as const;
type Row = { sourceId: string; sourceLabel: string; sourceUrl: string | null; sourceCanonicalUrl: string | null; createdAt: Date; rawText: string | null; captureMethod: string | null; capturedAt: string | null; model: string | null; promptVersion: string | null; jobId: string | null; jobStage: typeof stages[number] | null; jobUpdatedAt: Date | null };

export function createPostgresAdminYoutubeCapturePort(): AdminYoutubeCapturePort { return { list, detail }; }
async function list(input: { page: number }): Promise<AdminYoutubeCaptureQueue> {
  const rows = await query().orderBy(desc(sources.createdAt));
  // Evidence validity is determined from stored capture data before count/paging.
  const items = rows.flatMap(project);
  const offset = (input.page - 1) * adminYoutubeCapturePageSize;
  return { page: input.page, pageSize: adminYoutubeCapturePageSize, totalCount: items.length, items: items.slice(offset, offset + adminYoutubeCapturePageSize).map(({ evidence: _evidence, ...capture }) => capture) };
}
async function detail(sourceId: string): Promise<AdminYoutubeCaptureDetail | null> {
  if (!validId(sourceId)) return null;
  const [row] = await query(sourceId).limit(1);
  return row ? project(row)[0] ?? null : null;
}
function query(sourceId?: string) { const db = getDb(); return db.select({ sourceId: sources.id, sourceLabel: sources.label, sourceUrl: sources.url, sourceCanonicalUrl: sources.canonicalUrl, createdAt: sources.createdAt, rawText: sourceCaptureVersions.rawText, captureMethod: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'captureMethod'`, capturedAt: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'capturedAt'`, model: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'model'`, promptVersion: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'promptVersion'`, jobId: knowledgeIngestionJobs.id, jobStage: knowledgeIngestionJobs.stage, jobUpdatedAt: knowledgeIngestionJobs.updatedAt }).from(sources).innerJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, sources.currentCaptureVersionId)).leftJoin(knowledgeIngestionJobs, eq(knowledgeIngestionJobs.captureVersionId, sourceCaptureVersions.id)).where(and(eq(sources.kind, "youtube"), sourceId ? eq(sources.id, sourceId) : undefined)); }
function project(row: Row): AdminYoutubeCaptureDetail[] {
  if (row.captureMethod !== "gemini_youtube_url") return [];
  const evidence = parseEvidence(row.rawText); if (!evidence?.length) return [];
  const capture: AdminYoutubeCapture = { sourceId: row.sourceId, sourceLabel: safeText(row.sourceLabel, 500) ?? "YouTube video", displayUrl: safeUrl(row.sourceCanonicalUrl ?? row.sourceUrl), createdAt: row.createdAt.toISOString(), capturedAt: safeTimestamp(row.capturedAt), captureMethod: "gemini_youtube_url", model: safeText(row.model, 160), promptVersion: safeText(row.promptVersion, 160), evidenceCount: evidence.length, ingestionJob: row.jobId && row.jobStage && row.jobUpdatedAt ? { stage: row.jobStage, updatedAt: row.jobUpdatedAt.toISOString() } : null };
  return [{ ...capture, evidence }];
}
function parseEvidence(raw: string | null): AdminYoutubeCaptureEvidence[] | null { if (!raw?.trim()) return null; try { const root: unknown = JSON.parse(raw); if (!record(root) || !Array.isArray(root.evidence) || root.evidence.length < 1 || root.evidence.length > 80) return null; const evidence = root.evidence.map(evidenceItem); return evidence.some((item) => !item) ? null : evidence as AdminYoutubeCaptureEvidence[]; } catch { return null; } }
function evidenceItem(value: unknown): AdminYoutubeCaptureEvidence | null { if (!record(value) || Object.keys(value).some((key) => !["category", "claim_vi", "evidence_type", "timestamp_start_seconds", "timestamp_end_seconds", "confidence", "freshness_sensitive", "evidence_excerpt", "uncertainty_or_condition"].includes(key))) return null; const claim = boundedEvidenceText(value.claim_vi, 500); const excerpt = boundedEvidenceText(value.evidence_excerpt, 240); const condition = value.uncertainty_or_condition === null ? null : boundedEvidenceText(value.uncertainty_or_condition, 400); return ["road_condition", "route", "toll", "fuel", "charging", "rest_stop", "parking", "accommodation", "food", "attraction", "safety", "weather", "cost"].includes(value.category as string) && claim && ["spoken", "on_screen", "both"].includes(value.evidence_type as string) && integer(value.timestamp_start_seconds) && integer(value.timestamp_end_seconds) && (value.timestamp_end_seconds as number) >= (value.timestamp_start_seconds as number) && ["high", "medium", "low"].includes(value.confidence as string) && typeof value.freshness_sensitive === "boolean" && excerpt && (value.uncertainty_or_condition === null || condition) ? { category: value.category as AdminYoutubeCaptureEvidence["category"], claim, evidenceType: value.evidence_type as AdminYoutubeCaptureEvidence["evidenceType"], timestampStartSeconds: value.timestamp_start_seconds as number, timestampEndSeconds: value.timestamp_end_seconds as number, confidence: value.confidence as AdminYoutubeCaptureEvidence["confidence"], freshnessSensitive: value.freshness_sensitive, excerpt, uncertaintyOrCondition: condition } : null; }
function safeText(value: string | null, max: number) { const text = value?.replace(/[\u0000-\u001f\u007f]+/g, " ").trim(); return text && !unsafe.test(text) ? text.slice(0, max) : null; }
function boundedEvidenceText(value: unknown, max: number) { const text = typeof value === "string" ? value.trim() : ""; return text && text.length <= max ? text : null; }
function safeTimestamp(value: string | null) { const text = safeText(value, 100); return text && !Number.isNaN(Date.parse(text)) ? new Date(text).toISOString() : null; }
function safeUrl(value: string | null) { if (!value) return null; try { const url = new URL(value); if (url.protocol !== "https:" || unsafe.test(`${url.origin}${url.pathname}${url.hash}`)) return null; url.username = ""; url.password = ""; for (const key of [...url.searchParams.keys()]) if (/token|secret|code|key|signature|password/i.test(key) || unsafe.test(url.searchParams.get(key) ?? "")) url.searchParams.set(key, "[redacted]"); return url.toString().slice(0, 500); } catch { return null; } }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function integer(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 0; }
function validId(value: string) { return value.trim() === value && value.length > 0 && value.length <= 128; }
