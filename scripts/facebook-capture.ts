import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { chromium, type Page, type Response } from "playwright";

import { schema, users } from "../src/db/schema";
import { listQueuedFacebookSources, recordFacebookCaptureFailure, updateQueuedFacebookSourceRawText, type SafeFacebookCaptureMetadata } from "../src/features/knowledge/facebook-capture";
import { getDatabaseUrl, getEnvValue } from "./db-env";

type CliOptions = {
  sourceId?: string;
  limit?: number;
  yes: boolean;
  actorUserId?: string;
  actorEmail?: string;
};

type ExtractedFacebookText = {
  text: string;
  authorText?: string;
  timestampText?: string;
  diagnostics: Record<string, string | number | boolean | null>;
};

type CaptureTextSource = "dom" | "graphql";

type GraphqlTextCandidate = {
  text: string;
  postId: string | null;
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

export function extractFacebookGraphqlText(rawTexts: string[], input: { finalUrl?: string | null } = {}) {
  const targetPostId = extractFacebookPostId(input.finalUrl ?? "");
  const candidates: GraphqlTextCandidate[] = [];

  for (const rawText of rawTexts) {
    for (const payload of parseJsonPayloads(rawText)) {
      walkJson(payload, (node) => {
        if (!isRecord(node)) return;

        const text = extractMessageText(node);
        if (!text) return;

        const postId = typeof node.post_id === "string" || typeof node.post_id === "number" ? String(node.post_id) : null;
        candidates.push({ text, postId });
      });
    }
  }

  const matchingCandidates = targetPostId ? candidates.filter((candidate) => candidate.postId === targetPostId) : [];
  const best = (matchingCandidates.length > 0 ? matchingCandidates : candidates).sort((left, right) => right.text.length - left.text.length)[0];

  return best ?? null;
}

export function chooseBestFacebookCaptureText(input: { domText: string; graphqlText?: string | null }) {
  return chooseBestFacebookCaptureTextCandidate({ domText: input.domText, candidates: [{ source: "graphql", text: input.graphqlText }] });
}

export function chooseBestFacebookCaptureTextCandidate(input: { domText: string; candidates: Array<{ source: Exclude<CaptureTextSource, "dom">; text?: string | null }> }) {
  const domText = input.domText.trim();
  let best: { text: string; source: CaptureTextSource } = { text: domText, source: "dom" };

  for (const candidate of input.candidates) {
    const text = candidate.text?.trim() ?? "";
    if (!text) continue;

    if (!best.text || isPlausibleSameCaptureText({ currentText: best.text, candidateText: text })) {
      best = { text, source: candidate.source };
    }
  }

  return best;
}

function isPlausibleSameCaptureText(input: { currentText: string; candidateText: string }) {
  const currentText = input.currentText.trim();
  const candidateText = input.candidateText.trim();

  if (!currentText) return Boolean(candidateText);
  if (!candidateText) return false;

  const compactCurrentText = currentText.replace(/\s+/g, "");
  const compactCandidateText = candidateText.replace(/\s+/g, "");
  const lengthRatio = candidateText.length / Math.max(currentText.length, 1);
  const plausibleSamePost = lengthRatio >= 0.75 && lengthRatio <= 1.35;

  return plausibleSamePost && (isSubsequence(compactCurrentText, compactCandidateText) || candidateText.length >= currentText.length);
}

function parseJsonPayloads(rawText: string) {
  const payloads: unknown[] = [];
  const trimmed = rawText.trim();

  if (!trimmed) return payloads;

  try {
    payloads.push(JSON.parse(trimmed) as unknown);
    return payloads;
  } catch {
    // GraphQL responses may be newline-delimited JSON.
  }

  for (const line of trimmed.split("\n")) {
    const item = line.trim();
    if (!item) continue;

    try {
      payloads.push(JSON.parse(item) as unknown);
    } catch {
      // Ignore non-JSON diagnostics in mixed responses.
    }
  }

  return payloads;
}

function walkJson(value: unknown, visit: (node: unknown) => void, depth = 0) {
  if (!value || typeof value !== "object" || depth > 40) return;

  visit(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      walkJson(item, visit, depth + 1);
    }
    return;
  }

  for (const item of Object.values(value)) {
    walkJson(item, visit, depth + 1);
  }
}

function extractMessageText(node: Record<string, unknown>) {
  const directText = getNestedString(node, ["comet_sections", "content", "story", "message", "text"]) ?? getNestedString(node, ["message", "text"]) ?? getNestedString(node, ["story", "message", "text"]);

  if (directText) {
    return directText.replace(/\s+/g, " ").trim();
  }

  return null;
}

function getNestedString(value: unknown, path: string[]) {
  let current = value;

  for (const key of path) {
    if (!isRecord(current)) return null;
    current = current[key];
  }

  return typeof current === "string" && current.trim() ? current.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractFacebookPostId(url: string) {
  const patterns = [/\/permalink\/(\d+)/, /\/posts\/(\d+)/, /story_fbid=(\d+)/];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}


const DEFAULT_SYSTEM_ACTOR_USER_ID = "system-facebook-capture";
const DEFAULT_SYSTEM_ACTOR_EMAIL = "system-facebook-capture@xuyenviet.internal";

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

export async function extractVisibleFacebookText(page: Page): Promise<ExtractedFacebookText> {
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
    const messageTop = best?.element.getBoundingClientRect?.().top ?? Number.POSITIVE_INFINITY;
    const authorCandidate = article
      ? Array.from(article.querySelectorAll("strong"))
          .filter((element) => element instanceof HTMLElement)
          .find((element) => !best?.element.contains(element) && element.getBoundingClientRect().top <= messageTop)
      : undefined;
    const timestampCandidate = article
      ? Array.from(article.querySelectorAll('a[href*="/posts/"], a[href*="story_fbid"], a[href*="/permalink/"]'))
          .filter((element) => element instanceof HTMLElement)
          .find((element) => !best?.element.contains(element) && element.getBoundingClientRect().top <= messageTop)
      : undefined;
    const text = best?.text ?? "";
    const authorText = authorCandidate?.textContent?.trim() || undefined;
    const timestampText = timestampCandidate?.textContent?.trim() || undefined;

    return {
      text,
      authorText,
      timestampText,
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
        textLength: text.length,
      },
    };
  })()`);

  return result as ExtractedFacebookText;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const client = postgres(getDatabaseUrl(), { max: 1 });
  const db = drizzle(client, { schema });
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | null = null;

  try {
    const actor = await resolveCaptureActor(db, options);
    context = await chromium.launchPersistentContext(".playwright/facebook-profile", { headless: false });
    const queued = await listQueuedFacebookSources(db, { sourceId: options.sourceId, limit: options.limit });

    if (queued.length === 0) {
      console.log("No queued Facebook sources need raw text.");
      return;
    }

    let page = await context.newPage();

    for (const source of queued) {
      const sourceUrl = source.canonicalUrl?.trim() || source.url?.trim();

      if (!sourceUrl) {
        console.log(recordFacebookCaptureFailure(source.sourceId, "missing_facebook_url"));
        continue;
      }

      try {
        const graphqlTexts: string[] = [];
        const onResponse = async (response: Response) => {
          if (!/\/graphql/i.test(response.url())) return;

          try {
            const text = await response.text();
            if (text) graphqlTexts.push(text);
          } catch {
            // Some responses may be consumed by the browser or unavailable.
          }
        };

        page.on("response", onResponse);
        await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await page.waitForTimeout(2_000);

        const extracted = await extractVisibleFacebookText(page);
        page.off("response", onResponse);

        if (!extracted.text.trim()) {
          console.log(recordFacebookCaptureFailure(source.sourceId, extracted.diagnostics.usedArticleRole ? "no_visible_post_text" : "facebook_article_not_found"));
          continue;
        }

        const finalUrl = page.url();
        const graphqlCandidate = extractFacebookGraphqlText(graphqlTexts, { finalUrl });
        const selectedText = chooseBestFacebookCaptureTextCandidate({
          domText: extracted.text,
          candidates: [{ source: "graphql", text: graphqlCandidate?.text }],
        });
        const metadata: SafeFacebookCaptureMetadata = {
          captureMethod: "playwright_operator_browser",
          capturedAt: new Date().toISOString(),
          sourceUrl,
          finalUrl,
          authorText: extracted.authorText,
          timestampText: extracted.timestampText,
          diagnostics: {
            ...extracted.diagnostics,
            graphqlResponseCount: graphqlTexts.length,
            graphqlCandidateLength: graphqlCandidate?.text.length ?? 0,
            selectedCaptureTextSource: selectedText.source,
          },
        };

        const shouldSave = options.yes || (await confirmSave(source.sourceId, selectedText.text));

        if (!shouldSave) {
          console.log(`Skipped ${source.sourceId}; database unchanged.`);
          continue;
        }

        const result = await updateQueuedFacebookSourceRawText(db, {
          sourceId: source.sourceId,
          rawText: selectedText.text,
          captureMetadata: metadata,
          actor,
        });

        console.log(`Capture result for ${source.sourceId}: ${result.status}`);
      } catch (error) {
        const reason = error instanceof Error ? error.message.slice(0, 300) : "unknown_capture_error";
        console.log(recordFacebookCaptureFailure(source.sourceId, reason));

        if (page.isClosed()) {
          page = await context.newPage();
        }
      }
    }
  } finally {
    try {
      await context?.close();
    } finally {
      await client.end();
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
