import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { chromium, type Page } from "playwright";

import { schema, users } from "../src/db/schema";
import { findFacebookCaptureImportByCorrelationToken, listQueuedFacebookSources, normalizeDiscoveredFacebookPosts, recordFacebookCaptureFailure, updateQueuedFacebookSourceRawText, type SafeFacebookCaptureMetadata } from "../src/features/knowledge/facebook-capture";
import { admitArtifact, admitArtifactAlias, assertCaptureCacheReady, findArtifactByAlias, findForceLiveArtifact, findReusableArtifact, finishImport, linkForceLiveArtifact, prepareImport, supersedeDefaultArtifacts } from "../src/features/knowledge/capture-cache";
import { flushCachedArtifact } from "../src/features/knowledge/capture-orchestration";
import { CAPTURE_PAYLOAD_SCHEMA_VERSION, FACEBOOK_CAPTURE_METHOD_VERSION, canonicalizeFacebookUrl, captureReuseKey, facebookResourceIdentity } from "../src/features/knowledge/capture-identity";
import { assertDistinctCaptureDatabases, getCaptureCacheDatabaseUrl, getDatabaseUrl, getEnvValue } from "./db-env";

type CliOptions = {
  sourceId?: string;
  limit?: number;
  yes: boolean;
  actorUserId?: string;
  actorEmail?: string;
};

export type FacebookCapturePacing = {
  delayMinMs: number;
  delayMaxMs: number;
  batchSize: number;
  batchCooldownMs: number;
};

type ExtractedFacebookText = {
  text: string;
  linkedPostUrls: string[];
  authorText?: string;
  groupName?: string;
  timestampText?: string;
  postCreatedAt?: string;
  diagnostics: Record<string, string | number | boolean | null>;
};

export function chooseFacebookCaptureText(input: { innerText?: string | null; textContent?: string | null; renderedText?: string | null; htmlText?: string | null }) {
  const normalizeText = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
  const innerText = normalizeText(input.innerText);
  const textContent = normalizeText(input.textContent);
  const renderedText = normalizeText(input.renderedText);
  const htmlText = normalizeText(input.htmlText);

  if (!innerText) return { text: htmlText || renderedText || textContent, source: htmlText ? "htmlText" as const : renderedText ? "renderedText" as const : "textContent" as const, innerTextLength: innerText.length, textContentLength: textContent.length };

  const compactInnerText = innerText.replace(/\s+/g, "");
  const compactTextContent = textContent.replace(/\s+/g, "");
  const compactRenderedText = renderedText.replace(/\s+/g, "");
  const compactHtmlText = htmlText.replace(/\s+/g, "");
  const htmlExtraLength = htmlText.length - innerText.length;
  const boundedHtmlExtra = htmlExtraLength > 0 && htmlExtraLength <= Math.max(120, Math.round(innerText.length * 0.25));

  if (boundedHtmlExtra && isSubsequence(compactInnerText, compactHtmlText)) {
    return { text: htmlText, source: "htmlText" as const, innerTextLength: innerText.length, textContentLength: textContent.length };
  }

  const renderedExtraLength = renderedText.length - innerText.length;
  const boundedRenderedExtra = renderedExtraLength > 0 && renderedExtraLength <= Math.max(120, Math.round(innerText.length * 0.25));

  if (boundedRenderedExtra && isSubsequence(compactInnerText, compactRenderedText)) {
    return { text: renderedText, source: "renderedText" as const, innerTextLength: innerText.length, textContentLength: textContent.length };
  }

  if (!textContent || textContent === innerText) return { text: innerText, source: "innerText" as const, innerTextLength: innerText.length, textContentLength: textContent.length };

  const extraLength = textContent.length - innerText.length;
  const boundedExtra = extraLength > 0 && extraLength <= Math.max(120, Math.round(innerText.length * 0.25));

  if (boundedExtra && isSubsequence(compactInnerText, compactTextContent)) {
    return { text: textContent, source: "textContent" as const, innerTextLength: innerText.length, textContentLength: textContent.length };
  }

  return { text: innerText, source: "innerText" as const, innerTextLength: innerText.length, textContentLength: textContent.length };
}

function isSubsequence(needle: string, haystack: string) {
  let index = 0;

  for (const char of haystack) {
    if (char === needle[index]) {
      index += 1;
    }

    if (index === needle.length) {
      return true;
    }
  }

  return needle.length === 0;
}

function extractFacebookPostId(url: string) {
  const patterns = [
    /\/permalink\/(\d+)/i,
    /\/posts\/(\d+)/i,
    /[?&](?:story_fbid|fbid|ft_ent_identifier)=(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

function normalizeFacebookCaptureUrl(value: string) {
  try {
    const url = new URL(value);

    for (const key of Array.from(url.searchParams.keys())) {
      if (key.toLowerCase() === "fbclid" || key.toLowerCase() === "rdid" || key.toLowerCase().startsWith("utm_") || key.startsWith("__")) {
        url.searchParams.delete(key);
      }
    }

    url.hash = "";
    url.searchParams.sort();
    return url.toString();
  } catch {
    return value;
  }
}


const DEFAULT_SYSTEM_ACTOR_USER_ID = "system-facebook-capture";
const DEFAULT_SYSTEM_ACTOR_EMAIL = "system-facebook-capture@xuyenviet.internal";
const DEFAULT_CAPTURE_DELAY_MIN_MS = 12_000;
const DEFAULT_CAPTURE_DELAY_MAX_MS = 25_000;
const DEFAULT_CAPTURE_BATCH_SIZE = 10;
const DEFAULT_CAPTURE_BATCH_COOLDOWN_MS = 60_000;

function getNonNegativeIntegerEnv(name: string, defaultValue: number) {
  const value = getEnvValue(name);

  if (value === undefined) return defaultValue;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return parsed;
}

export function getFacebookCapturePacing(): FacebookCapturePacing {
  const delayMinMs = getNonNegativeIntegerEnv("FACEBOOK_CAPTURE_DELAY_MIN_MS", DEFAULT_CAPTURE_DELAY_MIN_MS);
  const delayMaxMs = getNonNegativeIntegerEnv("FACEBOOK_CAPTURE_DELAY_MAX_MS", DEFAULT_CAPTURE_DELAY_MAX_MS);
  const batchSize = getNonNegativeIntegerEnv("FACEBOOK_CAPTURE_BATCH_SIZE", DEFAULT_CAPTURE_BATCH_SIZE);
  const batchCooldownMs = getNonNegativeIntegerEnv("FACEBOOK_CAPTURE_BATCH_COOLDOWN_MS", DEFAULT_CAPTURE_BATCH_COOLDOWN_MS);

  if (delayMaxMs < delayMinMs) {
    throw new Error("FACEBOOK_CAPTURE_DELAY_MAX_MS must be greater than or equal to FACEBOOK_CAPTURE_DELAY_MIN_MS.");
  }

  if (batchSize < 1) {
    throw new Error("FACEBOOK_CAPTURE_BATCH_SIZE must be at least 1.");
  }

  return { delayMinMs, delayMaxMs, batchSize, batchCooldownMs };
}

export function getFacebookCaptureDelayMs(pacing: Pick<FacebookCapturePacing, "delayMinMs" | "delayMaxMs">, random = Math.random) {
  return pacing.delayMinMs + Math.floor(random() * (pacing.delayMaxMs - pacing.delayMinMs + 1));
}

export function parseCachedFacebookPayload(payload: unknown, sourceUrl: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("cache_invalid_facebook_payload");
  const value = payload as Record<string, unknown>;
  if (typeof value.rawText !== "string" || !value.rawText.trim() || !value.metadata || typeof value.metadata !== "object" || Array.isArray(value.metadata)) throw new Error("cache_invalid_facebook_payload");
  if (value.rawText.trim().length > 20_000) throw new Error("cache_invalid_facebook_payload");
  const metadata = value.metadata as Record<string, unknown>;
  if (metadata.captureMethod !== "playwright_operator_browser" || typeof metadata.capturedAt !== "string" || Number.isNaN(Date.parse(metadata.capturedAt)) || typeof metadata.sourceUrl !== "string" || typeof metadata.finalUrl !== "string" || !canonicalizeFacebookUrl(metadata.sourceUrl) || !canonicalizeFacebookUrl(metadata.finalUrl)) throw new Error("cache_invalid_facebook_payload");
  const discoveredUrls = Array.isArray(value.discoveredUrls) ? value.discoveredUrls.filter((url): url is string => typeof url === "string") : [];
  const cachedSourceUrl = typeof value.sourceUrl === "string" ? value.sourceUrl : sourceUrl;
  if (!canonicalizeFacebookUrl(cachedSourceUrl)) throw new Error("cache_invalid_facebook_payload");
  return { rawText: value.rawText.trim(), metadata: metadata as SafeFacebookCaptureMetadata, discoveredUrls: normalizeDiscoveredFacebookUrls(discoveredUrls, cachedSourceUrl), sourceUrl: cachedSourceUrl };
}

function normalizeDiscoveredFacebookUrls(urls: string[], sourceUrl: string) {
  return normalizeDiscoveredFacebookPosts(urls, sourceUrl).map((post) => post.url);
}

export function detectFacebookCaptureStopReason(input: { url: string; bodyText: string }) {
  const url = input.url.toLowerCase();
  const bodyText = input.bodyText.toLowerCase().replace(/\s+/g, " ");

  if (/facebook\.com\/(login|checkpoint)/.test(url)) return "facebook_login_or_checkpoint";
  if (/you('?| a)re temporarily blocked|you have been temporarily blocked|we limit how often|rate limit|too many requests|tạm thời bị chặn|bạn hiện không thể|giới hạn tần suất/.test(bodyText)) return "facebook_rate_limited_or_blocked";
  if (/confirm your identity|unusual activity|security check|xác nhận danh tính|hoạt động bất thường|kiểm tra bảo mật/.test(bodyText)) return "facebook_security_check";

  return null;
}

function getRequiredOptionValue(argv: string[], index: number, option: string) {
  const value = argv[index + 1];

  if (!value || value.startsWith("-")) {
    throw new Error(`${option} requires a value.`);
  }

  return value;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { yes: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--yes" || arg === "-y") {
      options.yes = true;
      continue;
    }

    if (arg === "--source-id") {
      options.sourceId = getRequiredOptionValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      const rawLimit = getRequiredOptionValue(argv, index, arg);
      const limit = Number(rawLimit);

      if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
        throw new Error("--limit must be an integer between 1 and 25.");
      }

      options.limit = limit;
      index += 1;
      continue;
    }

    if (arg === "--actor-user-id") {
      options.actorUserId = getRequiredOptionValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--actor-email") {
      options.actorEmail = getRequiredOptionValue(argv, index, arg);
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete option: ${arg}`);
  }

  if ((options.actorUserId && !options.actorEmail) || (!options.actorUserId && options.actorEmail)) {
    throw new Error("Provide both --actor-user-id and --actor-email, or omit both to use the configured system capture actor.");
  }

  return options;
}

function printHelp() {
  console.log(`Facebook capture operator tool

Usage:
  pnpm facebook:capture --limit 5
  pnpm facebook:capture --source-id <source-id>
  pnpm facebook:capture --source-id <source-id> --actor-user-id <id> --actor-email <email>

Options:
  --source-id       Capture one queued Facebook source by ID.
  --limit           Capture up to this many queued Facebook sources. Defaults to 5.
  --yes, -y         Save captured visible text without interactive confirmation.
  --actor-user-id   Optional operator user ID for audit_events. Omit to use FACEBOOK_CAPTURE_ACTOR_USER_ID or the default system actor.
  --actor-email     Optional operator email for audit_events. Omit to use FACEBOOK_CAPTURE_ACTOR_EMAIL or the default system actor.

First run opens a headed Chromium profile at .playwright/facebook-profile.
Log into Facebook manually in that browser, close or leave it open, then rerun this command.
Profile data stays local and must never be committed, copied into app secrets, or stored in PostgreSQL.
Scheduled runs should use a service user row matching FACEBOOK_CAPTURE_ACTOR_USER_ID and FACEBOOK_CAPTURE_ACTOR_EMAIL.
Pacing is configured through FACEBOOK_CAPTURE_DELAY_MIN_MS, FACEBOOK_CAPTURE_DELAY_MAX_MS,
FACEBOOK_CAPTURE_BATCH_SIZE, and FACEBOOK_CAPTURE_BATCH_COOLDOWN_MS. Defaults are a randomized
12-25 second delay between attempts and a one-minute cooldown after every 10 attempts.
This tool captures visible post text only. Broad Facebook content reuse, quoting, retention, and deletion policy remains an open product/legal operations question.`);
}

async function resolveCaptureActor(db: ReturnType<typeof drizzle<typeof schema>>, options: CliOptions) {
  const actor = {
    userId: options.actorUserId ?? getEnvValue("FACEBOOK_CAPTURE_ACTOR_USER_ID") ?? DEFAULT_SYSTEM_ACTOR_USER_ID,
    email: options.actorEmail ?? getEnvValue("FACEBOOK_CAPTURE_ACTOR_EMAIL") ?? DEFAULT_SYSTEM_ACTOR_EMAIL,
  };

  const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, actor.userId)).limit(1);

  if (!user || user.email !== actor.email) {
    throw new Error(
      `Facebook capture audit actor not found or email mismatch. Create a users row with id=${actor.userId} and email=${actor.email}, set FACEBOOK_CAPTURE_ACTOR_USER_ID/FACEBOOK_CAPTURE_ACTOR_EMAIL, or pass --actor-user-id and --actor-email.`,
    );
  }

  return actor;
}

function previewText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 1_200 ? `${normalized.slice(0, 1_200)}...` : normalized;
}

async function confirmSave(sourceId: string, text: string) {
  const rl = createInterface({ input, output });
  try {
    console.log(`\nSource: ${sourceId}`);
    console.log(`Captured characters: ${text.length}`);
    console.log("Preview:");
    console.log(previewText(text));
    const answer = await rl.question("\nSave this captured text to raw_source_material? [y/N] ");
    return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

export async function extractVisibleFacebookText(page: Page, finalUrl: string): Promise<ExtractedFacebookText> {
  const result = await page.evaluate(String.raw`(() => {
    const normalizeText = (value) => value.replace(/\s+/g, " ").trim();
    const getHtmlText = (element) => {
      const container = document.createElement("div");
      container.innerHTML = element.innerHTML.replace(/<\/?(div|p|br|li|ul|ol|h[1-6])\b[^>]*>/gi, "\n");
      return container.textContent ?? "";
    };
    const getCssGeneratedText = (element, pseudoElement) => {
      const content = window.getComputedStyle(element, pseudoElement).content;
      if (!content || content === "none" || content === "normal") return "";

      try {
        return JSON.parse(content);
      } catch {
        return content.replace(/^['\"]|['\"]$/g, "");
      }
    };
    const getRenderedText = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? "";
      if (!(node instanceof HTMLElement)) return "";
      if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(node.tagName)) return "";

      const beforeText = getCssGeneratedText(node, "::before");
      const childText = Array.from(node.childNodes).map(getRenderedText).join("");
      const afterText = getCssGeneratedText(node, "::after");

      return beforeText + childText + afterText;
    };
    const isSubsequence = (needle, haystack) => {
      let index = 0;
      for (const char of haystack) {
        if (char === needle[index]) index += 1;
        if (index === needle.length) return true;
      }
      return needle.length === 0;
    };
    const chooseText = (element) => {
      const innerText = normalizeText(element.innerText ?? "");
      const textContent = normalizeText(element.textContent ?? "");
      const renderedText = normalizeText(getRenderedText(element));
      const htmlText = normalizeText(getHtmlText(element));

      if (!innerText) return { text: htmlText || renderedText || textContent, source: htmlText ? "htmlText" : renderedText ? "renderedText" : "textContent", innerTextLength: innerText.length, textContentLength: textContent.length, htmlTextLength: htmlText.length };

      const compactInnerText = innerText.replace(/\s+/g, "");
      const compactTextContent = textContent.replace(/\s+/g, "");
      const compactRenderedText = renderedText.replace(/\s+/g, "");
      const compactHtmlText = htmlText.replace(/\s+/g, "");
      const htmlExtraLength = htmlText.length - innerText.length;
      const boundedHtmlExtra = htmlExtraLength > 0 && htmlExtraLength <= Math.max(120, Math.round(innerText.length * 0.25));

      if (boundedHtmlExtra && isSubsequence(compactInnerText, compactHtmlText)) {
        return { text: htmlText, source: "htmlText", innerTextLength: innerText.length, textContentLength: textContent.length, htmlTextLength: htmlText.length };
      }

      const renderedExtraLength = renderedText.length - innerText.length;
      const boundedRenderedExtra = renderedExtraLength > 0 && renderedExtraLength <= Math.max(120, Math.round(innerText.length * 0.25));

      if (boundedRenderedExtra && isSubsequence(compactInnerText, compactRenderedText)) {
        return { text: renderedText, source: "renderedText", innerTextLength: innerText.length, textContentLength: textContent.length, htmlTextLength: htmlText.length };
      }

      if (!textContent || textContent === innerText) return { text: innerText, source: "innerText", innerTextLength: innerText.length, textContentLength: textContent.length, htmlTextLength: htmlText.length };

      const extraLength = textContent.length - innerText.length;
      const boundedExtra = extraLength > 0 && extraLength <= Math.max(120, Math.round(innerText.length * 0.25));

      if (boundedExtra && isSubsequence(compactInnerText, compactTextContent)) {
        return { text: textContent, source: "textContent", innerTextLength: innerText.length, textContentLength: textContent.length, htmlTextLength: htmlText.length };
      }

      return { text: innerText, source: "innerText", innerTextLength: innerText.length, textContentLength: textContent.length, htmlTextLength: htmlText.length };
    };
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const messageSelectors = [
      '[data-ad-rendering-role="story_message"]',
      '[data-ad-preview="message"]',
      '[data-ad-comet-preview="message"]',
      '[data-testid="post_message"]',
    ];
    const articleSelector = '[role="article"], [data-pagelet*="FeedUnit"], [data-pagelet*="Stories"]';

    const isCommentArticle = (element) => {
      const ariaLabel = element.getAttribute("aria-label") ?? "";
      return /^(Comment|Reply) by /i.test(ariaLabel);
    };

    const getDialogPostRoots = (dialog) => {
      const positionedArticles = Array.from(dialog.querySelectorAll('[role="article"][aria-posinset]'))
        .filter((element) => element instanceof HTMLElement)
        .filter((element) => isVisible(element) && !isCommentArticle(element));

      if (positionedArticles.length > 0) {
        return positionedArticles;
      }

      const messageArticles = Array.from(dialog.querySelectorAll('[role="article"]'))
        .filter((element) => element instanceof HTMLElement)
        .filter((element) => isVisible(element) && !isCommentArticle(element) && element.querySelector(messageSelectors.join(", ")));

      return messageArticles.length > 0 ? messageArticles : [dialog];
    };

    const collectCandidates = (root, scope) => {
      const messageCandidates = Array.from(root.querySelectorAll(messageSelectors.join(", ")))
        .filter((element) => element instanceof HTMLElement)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const selectedText = chooseText(element);

          return {
            element,
            text: selectedText.text,
            selectedTextSource: selectedText.source,
            innerTextLength: selectedText.innerTextLength,
            textContentLength: selectedText.textContentLength,
            htmlTextLength: selectedText.htmlTextLength,
            scope,
            usedPostMessageSelector: true,
            visible: rect.width > 0 && rect.height > 0,
            rectArea: Math.round(rect.width * rect.height),
            top: rect.top,
          };
        })
        .filter((candidate) => candidate.visible && candidate.text.length > 0)
        .sort((left, right) => left.top - right.top || right.text.length - left.text.length);

      const articleCandidates = Array.from(root.querySelectorAll(articleSelector))
        .filter((element) => element instanceof HTMLElement)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const selectedText = chooseText(element);

          return {
            element,
            text: selectedText.text,
            selectedTextSource: selectedText.source,
            innerTextLength: selectedText.innerTextLength,
            textContentLength: selectedText.textContentLength,
            htmlTextLength: selectedText.htmlTextLength,
            scope,
            usedPostMessageSelector: false,
            visible: rect.width > 0 && rect.height > 0,
            rectArea: Math.round(rect.width * rect.height),
            top: rect.top,
          };
        })
        .filter((candidate) => candidate.visible && candidate.text.length > 0)
        .sort((left, right) => left.top - right.top || right.text.length - left.text.length);

      return {
        messageCandidates,
        articleCandidates,
        candidates: messageCandidates.length > 0 ? messageCandidates : articleCandidates,
      };
    };

    const dialogRoots = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]'))
      .filter((element) => element instanceof HTMLElement)
      .filter(isVisible)
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return Math.round(rightRect.width * rightRect.height) - Math.round(leftRect.width * leftRect.height);
      });
    const dialogPostRoots = dialogRoots.flatMap(getDialogPostRoots);
    const dialogCandidateSets = dialogPostRoots.map((root) => collectCandidates(root, "dialog"));
    const dialogMessageCandidates = dialogCandidateSets.flatMap((set) => set.messageCandidates);
    const pageCandidateSet = collectCandidates(document, "page");
    const selectedSet = dialogRoots.length > 0 ? { candidates: dialogMessageCandidates } : pageCandidateSet;
    const candidates = selectedSet.candidates;
    const best = candidates[0];
    const article = best?.element.closest?.('[role="article"]') ?? best?.element;
    const targetPostId = ${JSON.stringify(extractFacebookPostId(finalUrl))};
    const getPostId = (href) => {
      const match = href.match(/\/permalink\/(\d+)|\/posts\/(\d+)|[?&](?:story_fbid|fbid|ft_ent_identifier)=(\d+)/i);
      return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
    };
    const targetLinks = targetPostId
      ? Array.from(document.querySelectorAll('a[href]')).filter((element) => getPostId(element.href) === targetPostId)
      : [];
    const targetPostRoot = targetLinks
      .map((link) => link.closest('[role="article"], [data-pagelet*="FeedUnit"], [data-pagelet*="Stories"]') ?? findPostRoot(link))
      .find((root) => root instanceof HTMLElement && isVisible(root));
    const hasTargetPermalink = Boolean(targetPostRoot);
    const authorCandidate = targetPostRoot
      ? Array.from(targetPostRoot.querySelectorAll('strong, h2, h3, a[role="link"]'))
          .filter((element) => element instanceof HTMLElement)
          .find((element) => {
            const text = element.textContent?.trim() ?? "";
            return text.length > 0 && text.length <= 200 && !targetLinks.includes(element);
          })
      : undefined;
    const timestampCandidate = targetLinks[0];
    const timestampElement = targetPostRoot?.querySelector('time[datetime], abbr[data-utime]');
    const dateTime = timestampElement?.getAttribute('datetime');
    const unixTime = timestampElement?.getAttribute('data-utime');
    const postCreatedAt = dateTime && !Number.isNaN(Date.parse(dateTime))
      ? new Date(dateTime).toISOString()
      : unixTime && /^\d+$/.test(unixTime)
        ? new Date(Number(unixTime) * 1000).toISOString()
        : undefined;
    const text = best?.text ?? "";
    const linkedPostUrls = article
      ? Array.from(article.querySelectorAll("a[href]"))
          .map((element) => element.href)
          .filter((href) => /facebook\.com|fb\.watch|fb\.com/i.test(href))
      : [];
    const groupName = authorCandidate?.textContent?.trim() || undefined;
    const rawTimestampText = timestampCandidate?.textContent?.trim() || undefined;
    const timestampText = isPlausibleTimestampText(rawTimestampText) ? rawTimestampText : undefined;

    return {
      text,
      linkedPostUrls,
      groupName,
      timestampText,
      postCreatedAt,
      diagnostics: {
        usedDialogScope: best?.scope === "dialog",
        usedArticleRole: Boolean(article?.matches('[role="article"]')),
        usedPostMessageSelector: Boolean(best?.usedPostMessageSelector),
        dialogRootCount: dialogRoots.length,
        dialogPostRootCount: dialogPostRoots.length,
        dialogCandidateCount: dialogMessageCandidates.length,
        messageCandidateCount: pageCandidateSet.messageCandidates.length,
        articleCandidateCount: pageCandidateSet.articleCandidates.length,
        candidateCount: candidates.length,
        longestCandidateLength: candidates[0]?.text.length ?? 0,
        secondCandidateLength: candidates[1]?.text.length ?? 0,
        selectedTextSource: best?.selectedTextSource ?? null,
        selectedInnerTextLength: best?.innerTextLength ?? 0,
        selectedTextContentLength: best?.textContentLength ?? 0,
        selectedHtmlTextLength: best?.htmlTextLength ?? 0,
        selectedRectArea: best?.rectArea ?? 0,
        domTargetPermalinkLinkCount: targetLinks.length,
        domTargetPermalinkMatched: Boolean(hasTargetPermalink),
        domMachineTimestampFound: Boolean(postCreatedAt),
        textLength: text.length,
      },
    };

    function findPostRoot(element) {
      let current = element.parentElement;
      while (current && current !== document.body) {
        if (current.querySelector(messageSelectors.join(", "))) return current;
        current = current.parentElement;
      }
      return element.parentElement;
    }

    function isPlausibleTimestampText(value) {
      if (!value || value.length > 100) return false;
      const letters = (value.match(/[\p{L}]/gu) ?? []).length;
      const digits = (value.match(/\d/g) ?? []).length;
      return letters >= 2 && digits <= 12;
    }
  })()`);

  return result as ExtractedFacebookText;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const client = postgres(getDatabaseUrl(), { max: 1 });
  const cacheClient = postgres(getCaptureCacheDatabaseUrl(), { max: 1 });
  const db = drizzle(client, { schema });
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | null = null;

  try {
    await assertDistinctCaptureDatabases(client, cacheClient);
    await assertCaptureCacheReady(cacheClient);
    const actor = await resolveCaptureActor(db, options);
    const pacing = getFacebookCapturePacing();
    const queued = await listQueuedFacebookSources(db, { sourceId: options.sourceId, limit: options.limit });

    if (queued.length === 0) {
      console.log("No queued Facebook sources need raw text.");
      return;
    }

    let page: Page | null = null;

    for (const [index, source] of queued.entries()) {
      if (index > 0) {
        if (index % pacing.batchSize === 0 && pacing.batchCooldownMs > 0) {
          console.log(`Facebook capture cooldown: waiting ${pacing.batchCooldownMs}ms after ${index} attempts.`);
          await new Promise((resolve) => setTimeout(resolve, pacing.batchCooldownMs));
        } else {
          const delayMs = getFacebookCaptureDelayMs(pacing);
          if (delayMs > 0) {
            console.log(`Facebook capture pacing: waiting ${delayMs}ms before the next attempt.`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
      }

      const sourceUrl = source.canonicalUrl?.trim() || source.url?.trim();

      if (!sourceUrl) {
        console.log(recordFacebookCaptureFailure(source.sourceId, "missing_facebook_url"));
        continue;
      }

      try {
        const identity = facebookResourceIdentity({ submittedUrl: sourceUrl });
        if (!identity) throw new Error("invalid_facebook_resource_identity");
        const reuseKey = captureReuseKey({ provider: "facebook", resourceIdentity: identity, captureMethodVersion: FACEBOOK_CAPTURE_METHOD_VERSION, payloadSchemaVersion: CAPTURE_PAYLOAD_SCHEMA_VERSION });
        const submittedAlias = canonicalizeFacebookUrl(sourceUrl);
        const reusableArtifact = await findReusableArtifact(cacheClient, reuseKey) ?? (submittedAlias ? await findArtifactByAlias(cacheClient, { provider: "facebook", aliasUrl: submittedAlias, resourceIdentity: identity, captureMethodVersion: FACEBOOK_CAPTURE_METHOD_VERSION, payloadSchemaVersion: CAPTURE_PAYLOAD_SCHEMA_VERSION, allowValidatedAlias: identity.startsWith("submitted:") }) : null);
        let artifact = source.forceLiveCapture
          ? await findForceLiveArtifact(cacheClient, source.sourceId, source.forceLiveCaptureGeneration)
          : reusableArtifact;
        if (artifact) {
          const cachedArtifact = artifact;
          const payload = parseCachedFacebookPayload(cachedArtifact.payload, sourceUrl);
          const result = await flushCachedArtifact({ artifact: cachedArtifact, sourceId: source.sourceId, prepareImport: () => prepareImport(cacheClient, cachedArtifact.id, source.sourceId), importCommitted: (correlationToken) => findFacebookCaptureImportByCorrelationToken(db, { sourceId: source.sourceId, correlationToken }), flush: (correlationToken) => updateQueuedFacebookSourceRawText(db, { sourceId: source.sourceId, rawText: payload.rawText, captureMetadata: { ...payload.metadata, captureOrigin: source.forceLiveCapture ? "live" : "cache", captureArtifactId: cachedArtifact.id, importedAt: new Date().toISOString(), importCorrelationToken: correlationToken, captureMethodVersion: FACEBOOK_CAPTURE_METHOD_VERSION, payloadSchemaVersion: CAPTURE_PAYLOAD_SCHEMA_VERSION, importActorId: actor.userId }, actor, discoveredUrls: payload.discoveredUrls, sourceUrl: payload.sourceUrl, expectedForceLiveCapture: source.forceLiveCapture, expectedForceLiveCaptureGeneration: source.forceLiveCaptureGeneration }).then((value) => value.status), finishImport: (correlationToken, leaseOwner, outcome) => finishImport(cacheClient, cachedArtifact.id, source.sourceId, correlationToken, leaseOwner, outcome) });
          console.log(`Capture cache replay for ${source.sourceId}: ${result}`);
          continue;
        }
        if (!context) { context = await chromium.launchPersistentContext(".playwright/facebook-profile", { headless: false }); page = await context.newPage(); }
        if (!page) throw new Error("facebook_browser_unavailable");
        await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await page.waitForTimeout(2_000);

        const stopReason = detectFacebookCaptureStopReason({
          url: page.url(),
          bodyText: await page.locator("body").innerText().catch(() => ""),
        });
        if (stopReason) {
          console.log(`Stopping Facebook capture: ${stopReason}. No further queued sources will be opened.`);
          break;
        }

        const finalUrl = normalizeFacebookCaptureUrl(page.url());
        const extracted = await extractVisibleFacebookText(page, finalUrl);

        if (!extracted.text.trim()) {
          console.log(recordFacebookCaptureFailure(source.sourceId, extracted.diagnostics.usedArticleRole ? "no_visible_post_text" : "facebook_article_not_found"));
          continue;
        }

        const metadata: SafeFacebookCaptureMetadata = {
          captureMethod: "playwright_operator_browser",
          capturedAt: new Date().toISOString(),
          sourceUrl,
          finalUrl,
          authorText: extracted.authorText,
          groupName: extracted.groupName,
          timestampText: extracted.timestampText,
          postCreatedAt: extracted.postCreatedAt,
          diagnostics: {
            ...extracted.diagnostics,
            selectedCaptureTextSource: "dom",
          },
        };

        const shouldSave = options.yes || (await confirmSave(source.sourceId, extracted.text));

        if (!shouldSave) {
          console.log(`Skipped ${source.sourceId}; database unchanged.`);
          continue;
        }

        const liveIdentity = facebookResourceIdentity({ finalUrl, submittedUrl: sourceUrl });
        if (!liveIdentity) throw new Error("invalid_facebook_resource_identity");
        const liveReuseKey = captureReuseKey({ provider: "facebook", resourceIdentity: liveIdentity, captureMethodVersion: FACEBOOK_CAPTURE_METHOD_VERSION, payloadSchemaVersion: CAPTURE_PAYLOAD_SCHEMA_VERSION });
        const discoveredUrls = normalizeDiscoveredFacebookUrls(extracted.linkedPostUrls, sourceUrl);
        artifact = await admitArtifact(cacheClient, { provider: "facebook", reuseKey: liveReuseKey, resourceIdentity: liveIdentity, captureMethodVersion: FACEBOOK_CAPTURE_METHOD_VERSION, payloadSchemaVersion: CAPTURE_PAYLOAD_SCHEMA_VERSION, promptVersion: null, model: null, payload: { rawText: extracted.text, metadata, discoveredUrls, sourceUrl }, metadata: { captureOrigin: "live" }, capturedAt: metadata.capturedAt });
        if (source.forceLiveCapture) {
          const linkedArtifactId = await linkForceLiveArtifact(cacheClient, source.sourceId, source.forceLiveCaptureGeneration, artifact.id);
          if (linkedArtifactId !== artifact.id) {
            const linkedArtifact = await findForceLiveArtifact(cacheClient, source.sourceId, source.forceLiveCaptureGeneration);
            if (!linkedArtifact) throw new Error("capture_force_live_artifact_missing");
            artifact = linkedArtifact;
          }
        }
        const finalAlias = canonicalizeFacebookUrl(finalUrl);
        const submittedPostId = submittedAlias ? extractFacebookPostId(submittedAlias) : null;
        if (submittedAlias && finalAlias && (!submittedPostId || liveIdentity === `post:${submittedPostId}`)) {
          await admitArtifactAlias(cacheClient, { artifactId: artifact.id, provider: "facebook", aliasUrl: submittedAlias, resourceIdentity: liveIdentity });
        }
        const liveArtifact = artifact;
        const livePayload = parseCachedFacebookPayload(liveArtifact.payload, sourceUrl);
        const result = await flushCachedArtifact({ artifact: liveArtifact, sourceId: source.sourceId, prepareImport: () => prepareImport(cacheClient, liveArtifact.id, source.sourceId), importCommitted: (correlationToken) => findFacebookCaptureImportByCorrelationToken(db, { sourceId: source.sourceId, correlationToken }), flush: (correlationToken) => updateQueuedFacebookSourceRawText(db, { sourceId: source.sourceId, rawText: livePayload.rawText, captureMetadata: { ...livePayload.metadata, captureOrigin: "live", captureArtifactId: liveArtifact.id, importedAt: new Date().toISOString(), importCorrelationToken: correlationToken, captureMethodVersion: FACEBOOK_CAPTURE_METHOD_VERSION, payloadSchemaVersion: CAPTURE_PAYLOAD_SCHEMA_VERSION, captureActorId: actor.userId, importActorId: actor.userId }, actor, discoveredUrls: livePayload.discoveredUrls, sourceUrl: livePayload.sourceUrl, expectedForceLiveCapture: source.forceLiveCapture, expectedForceLiveCaptureGeneration: source.forceLiveCaptureGeneration }).then((value) => value.status), finishImport: (correlationToken, leaseOwner, outcome) => finishImport(cacheClient, liveArtifact.id, source.sourceId, correlationToken, leaseOwner, outcome) });
        if (source.forceLiveCapture && (result === "updated" || result === "imported")) await supersedeDefaultArtifacts(cacheClient, artifact);

        console.log(`Capture result for ${source.sourceId}: ${result}`);
      } catch (error) {
        const reason = error instanceof Error ? error.message.slice(0, 300) : "unknown_capture_error";
        console.log(recordFacebookCaptureFailure(source.sourceId, reason));

        if (page?.isClosed() && context) {
          page = await context.newPage();
        }
      }

    }
  } finally {
    try {
      await context?.close();
    } finally {
      await client.end();
      await cacheClient.end();
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
