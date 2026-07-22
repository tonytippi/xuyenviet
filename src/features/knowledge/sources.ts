import "server-only";

import { desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db/client";
import { facebookCaptureReviews, knowledgeCards, knowledgeCardSources, knowledgeExtractionJobs, sourceCaptureVersions, sources, type FacebookCaptureReviewStatus, type KnowledgeExtractionJobMode, type KnowledgeExtractionJobStatus, type SourceKind, type SourceType } from "@/db/schema";
import { requireAdminSession } from "@/server/auth";

const maxRawTextLength = 20_000;
const maxLabelLength = 200;
const maxPublisherLength = 160;
const maxScreenshotByteSize = 5 * 1024 * 1024;
const allowedScreenshotMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
const trackingParamPrefixes = ["utm_"];
const trackingParams = new Set(["fbclid", "gclid"]);
const unsafeMetadataValuePattern = /cookie|token|local\s*storage|localStorage|provider\s*payload|providerPayload|browser\s*profile|playwright\/facebook-profile|<html|<!doctype|hidden\s*data/i;

type ScreenshotMetadata = {
  fileName: string;
  mimeType: string;
  byteSize: number;
  storageKey: string | null;
};

export type TravelSourceInput = {
  url?: string | null;
  label?: string | null;
  publisher?: string | null;
  collectedDate?: string | null;
  rawText?: string | null;
  copiedCommunityContent?: boolean;
  screenshot?: {
    fileName?: string | null;
    mimeType?: string | null;
    byteSize?: number | null;
    storageKey?: string | null;
  } | null;
  rawMetadata?: Record<string, unknown> | null;
};

export type NormalizedTravelSource = {
  source: Omit<typeof sources.$inferInsert, "id" | "submittedByUserId" | "createdAt">;
  capture: { rawText: string | null; metadata: import("./source-captures").GenericCaptureMetadata; file: ScreenshotMetadata | null };
};

export type KnowledgeUrlSourceListItem = Pick<typeof sources.$inferSelect, "id" | "kind" | "url" | "canonicalUrl" | "label" | "publisher" | "createdAt" | "eligibility" | "removalReason"> & {
  displayTitle: string;
  facebookCaptureReviewId: string | null;
  facebookCaptureStatus: FacebookCaptureReviewStatus | null;
  linkedKnowledgeCardCount: number;
  activeExtractionJob: { id: string; mode: KnowledgeExtractionJobMode; status: Extract<KnowledgeExtractionJobStatus, "queued" | "running"> } | null;
};

export class SourceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceValidationError";
  }
}

export function isSourceValidationError(error: unknown) {
  return error instanceof SourceValidationError || (error instanceof Error && error.name === "SourceValidationError");
}

export function normalizeTravelSourceInput(input: TravelSourceInput): NormalizedTravelSource {
  const url = normalizeOptionalString(input.url);
  const rawText = normalizeOptionalString(input.rawText);
  const screenshot = normalizeScreenshot(input.screenshot);
  const copiedCommunityContent = input.copiedCommunityContent === true;

  if (!url && !rawText && !screenshot) {
    throw new SourceValidationError("Cần nhập URL, nội dung văn bản hoặc metadata ảnh chụp.");
  }

  if (rawText && rawText.length > maxRawTextLength) {
    throw new SourceValidationError("Nội dung nguồn quá dài. Giới hạn hiện tại là 20.000 ký tự.");
  }

  const parsedUrl = url ? parseUrl(url) : null;
  const isFacebook = parsedUrl ? isFacebookUrl(parsedUrl) : false;
  const isYoutube = parsedUrl ? isYoutubeUrl(parsedUrl) : false;
  const kind = getSourceKind({ url: parsedUrl, rawText, screenshot, copiedCommunityContent, isFacebook, isYoutube });
  const sourceType: SourceType = isFacebook || isYoutube || copiedCommunityContent ? "community" : "curated";
  const label = normalizeSafeMetadataString(input.label, "Nhãn nguồn", maxLabelLength) ?? deriveLabel({ parsedUrl, rawText, screenshot, kind });

  return {
    source: {
      kind,
      url: parsedUrl ? canonicalizeUrl(parsedUrl) : null,
      canonicalUrl: null,
      label,
      publisher: normalizeSafeMetadataString(input.publisher, "Nhà xuất bản", maxPublisherLength) ?? derivePublisher(parsedUrl),
      collectedDate: normalizeCollectedDate(input.collectedDate),
      sourceType,
      verificationStatus: "unverified",
      official: false,
      partner: false,
    },
    capture: {
      rawText,
      metadata: { kind: "submitted", ...(screenshot ? { fileName: screenshot.fileName, mimeType: screenshot.mimeType as "image/jpeg" | "image/png" | "image/webp", byteSize: screenshot.byteSize, storageKey: screenshot.storageKey ?? undefined } : {}) },
      file: screenshot,
    },
  };
}

export async function listKnowledgeUrlSources(): Promise<KnowledgeUrlSourceListItem[]> {
  await requireAdminSession();
  const db = getDb();

  const rows = await db
    .select({
      id: sources.id,
      kind: sources.kind,
      url: sources.url,
      canonicalUrl: sources.canonicalUrl,
      label: sources.label,
      publisher: sources.publisher,
      eligibility: sources.eligibility,
      removalReason: sources.removalReason,
      createdAt: sources.createdAt,
    })
    .from(sources)
    .where(inArray(sources.kind, ["url", "facebook", "youtube"]))
    .orderBy(desc(sources.createdAt), desc(sources.id));

  if (rows.length === 0) {
    return [];
  }

  const sourceIds = rows.map((source) => source.id);
  const reviewRows = await db
    .select({
      id: facebookCaptureReviews.id,
      sourceId: facebookCaptureReviews.sourceId,
      status: facebookCaptureReviews.status,
       rawMetadata: sourceCaptureVersions.rawMetadata,
       rawText: sourceCaptureVersions.rawText,
    })
    .from(facebookCaptureReviews)
     .innerJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, facebookCaptureReviews.captureVersionId))
    .where(inArray(facebookCaptureReviews.sourceId, sourceIds));
  const cardRows = await db
    .select({ sourceId: knowledgeCardSources.sourceId, knowledgeCardId: knowledgeCards.id, title: knowledgeCards.title })
    .from(knowledgeCardSources)
    .innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeCardSources.knowledgeCardId))
    .where(inArray(knowledgeCardSources.sourceId, sourceIds))
    .orderBy(desc(knowledgeCards.updatedAt));
  const activeJobRows = await db
    .select({ id: knowledgeExtractionJobs.id, sourceId: knowledgeExtractionJobs.sourceId, mode: knowledgeExtractionJobs.mode, status: knowledgeExtractionJobs.status })
    .from(knowledgeExtractionJobs)
    .where(inArray(knowledgeExtractionJobs.sourceId, sourceIds));
  const reviewsBySourceId = new Map(reviewRows.map((review) => [review.sourceId, review]));
  const cardCountsBySourceId = new Map<string, number>();
  const firstCardTitleBySourceId = new Map<string, string>();
  const activeJobsBySourceId = new Map(
    activeJobRows
      .filter((job): job is typeof job & { status: "queued" | "running" } => job.status === "queued" || job.status === "running")
      .map((job) => [job.sourceId, { id: job.id, mode: job.mode, status: job.status }]),
  );

  for (const row of cardRows) {
    cardCountsBySourceId.set(row.sourceId, (cardCountsBySourceId.get(row.sourceId) ?? 0) + 1);
    if (!firstCardTitleBySourceId.has(row.sourceId)) {
      firstCardTitleBySourceId.set(row.sourceId, row.title);
    }
  }

  return rows.map((source) => {
    const review = reviewsBySourceId.get(source.id);
    const metadataTitle = review ? deriveCapturedMetadataTitle(review.rawMetadata) : null;
    const capturedTextTitle = review ? deriveCapturedTextTitle(review.rawText) : null;
    return {
      ...source,
      displayTitle: firstCardTitleBySourceId.get(source.id) ?? metadataTitle ?? capturedTextTitle ?? source.label,
      facebookCaptureReviewId: review?.id ?? null,
      facebookCaptureStatus: review?.status ?? null,
      linkedKnowledgeCardCount: cardCountsBySourceId.get(source.id) ?? 0,
      activeExtractionJob: activeJobsBySourceId.get(source.id) ?? null,
    };
  });
}

function deriveCapturedMetadataTitle(metadata: Record<string, unknown> | null) {
  const authorText = sanitizeMetadataText(readMetadataString(metadata, "authorText"));
  const timestampText = sanitizeMetadataText(readMetadataString(metadata, "timestampText"));

  if (authorText && timestampText) {
    return `${authorText} · ${timestampText}`;
  }

  return authorText ?? timestampText;
}

function readMetadataString(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function sanitizeMetadataText(value: string | null) {
  const text = value?.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();

  if (!text || unsafeMetadataValuePattern.test(text)) {
    return null;
  }

  return text.slice(0, maxLabelLength);
}

function deriveCapturedTextTitle(rawText: string | null) {
  const firstLine = rawText
    ?.replace(/[\u0000-\u001f\u007f]+/g, " ")
    .split(/\s{2,}/)
    .map((part) => part.trim())
    .find(Boolean);

  if (!firstLine) {
    return null;
  }

  return firstLine.length > maxLabelLength ? `${firstLine.slice(0, maxLabelLength - 1)}…` : firstLine;
}

function getSourceKind({
  url,
  rawText,
  screenshot,
  copiedCommunityContent,
  isFacebook,
  isYoutube,
}: {
  url: URL | null;
  rawText: string | null;
  screenshot: ScreenshotMetadata | null;
  copiedCommunityContent: boolean;
  isFacebook: boolean;
  isYoutube: boolean;
}): SourceKind {
  if (isFacebook) return "facebook";
  if (isYoutube) return "youtube";
  if (url) return "url";
  if (screenshot) return "screenshot";
  if (copiedCommunityContent && rawText) return "copied_post";
  return "pasted_text";
}

function parseUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new SourceValidationError("URL nguồn phải dùng http hoặc https.");
    }
    return parsed;
  } catch {
    throw new SourceValidationError("URL nguồn không hợp lệ.");
  }
}

function canonicalizeUrl(url: URL) {
  const canonical = new URL(url.toString());

  const youtubeVideoId = extractYoutubeVideoId(canonical);
  if (youtubeVideoId) {
    return `https://www.youtube.com/watch?v=${youtubeVideoId}`;
  }

  canonical.hash = "";

  for (const key of Array.from(canonical.searchParams.keys())) {
    if (trackingParams.has(key.toLowerCase()) || trackingParamPrefixes.some((prefix) => key.toLowerCase().startsWith(prefix))) {
      canonical.searchParams.delete(key);
    }
  }

  canonical.searchParams.sort();
  return canonical.toString();
}

function isFacebookUrl(url: URL) {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.com" || host === "fb.watch";
}

function isYoutubeUrl(url: URL) {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be";
}

function extractYoutubeVideoId(url: URL) {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const videoId = host === "youtu.be" ? url.pathname.split("/").filter(Boolean)[0] : url.pathname.startsWith("/watch") ? url.searchParams.get("v") : url.pathname.match(/^\/(?:shorts|live)\/([^/]+)/)?.[1] ?? null;
  return videoId && /^[A-Za-z0-9_-]{6,20}$/.test(videoId) ? videoId : null;
}

function normalizeScreenshot(screenshot: TravelSourceInput["screenshot"]) {
  if (!screenshot) {
    return null;
  }

  const fileName = normalizeOptionalString(screenshot.fileName);
  const mimeType = normalizeOptionalString(screenshot.mimeType);
  const byteSize = screenshot.byteSize;

  if (!fileName || !mimeType || byteSize === null || byteSize === undefined) {
    throw new SourceValidationError("Metadata ảnh chụp cần đủ tên file, loại file và dung lượng.");
  }

  if (!allowedScreenshotMimeTypes.includes(mimeType as (typeof allowedScreenshotMimeTypes)[number])) {
    throw new SourceValidationError("Ảnh chụp chỉ hỗ trợ JPEG, PNG hoặc WebP.");
  }

  if (!Number.isInteger(byteSize) || byteSize <= 0 || byteSize > maxScreenshotByteSize) {
    throw new SourceValidationError("Dung lượng ảnh chụp phải lớn hơn 0 và không vượt quá 5MB.");
  }

  return {
    fileName,
    mimeType,
    byteSize,
    storageKey: normalizeOptionalString(screenshot.storageKey),
  };
}

function normalizeCollectedDate(value: string | null | undefined) {
  const normalized = normalizeOptionalString(value);

  if (!normalized) {
    return null;
  }

  const date = new Date(`${normalized}T00:00:00.000Z`);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw new SourceValidationError("Ngày thu thập cần theo định dạng YYYY-MM-DD.");
  }

  return normalized;
}

function normalizeOptionalString(value: string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return value.trim() || null;
}

function normalizeSafeMetadataString(value: string | null | undefined, fieldName: string, maxLength: number) {
  const normalized = normalizeOptionalString(value);

  if (!normalized) {
    return null;
  }

  if (normalized.includes("\n") || normalized.includes("\r") || normalized.length > maxLength) {
    throw new SourceValidationError(`${fieldName} cần ngắn gọn và không chứa nội dung thô.`);
  }

  return normalized;
}

function deriveLabel({ parsedUrl, rawText, screenshot, kind }: { parsedUrl: URL | null; rawText: string | null; screenshot: { fileName: string } | null; kind: SourceKind }) {
  if (parsedUrl) {
    return parsedUrl.hostname.replace(/^www\./, "");
  }

  if (screenshot) {
    return "Ảnh chụp nguồn du lịch";
  }

  if (rawText) {
    return kind === "copied_post" ? "Bài cộng đồng đã sao chép" : "Văn bản đã dán";
  }

  return "Nguồn du lịch";
}

function derivePublisher(parsedUrl: URL | null) {
  return parsedUrl?.hostname.replace(/^www\./, "") ?? null;
}
