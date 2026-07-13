import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { chromium, type Page } from "playwright";

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
  const result = await page.evaluate(`(() => {
    const normalizeText = (value) => value.replace(/\s+/g, " ").trim();
    const messageSelectors = [
      '[data-ad-preview="message"]',
      '[data-ad-comet-preview="message"]',
      '[data-testid="post_message"]',
    ];

    const messageCandidates = Array.from(document.querySelectorAll(messageSelectors.join(", ")))
      .filter((element) => element instanceof HTMLElement)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const text = normalizeText(element.innerText ?? "");

        return {
          element,
          text,
          visible: rect.width > 0 && rect.height > 0,
          rectArea: Math.round(rect.width * rect.height),
          top: rect.top,
        };
      })
      .filter((candidate) => candidate.visible && candidate.text.length > 0)
      .sort((left, right) => left.top - right.top || right.text.length - left.text.length);

    const articleCandidates = Array.from(document.querySelectorAll('[role="article"], [data-pagelet*="FeedUnit"], [data-pagelet*="Stories"]'))
      .filter((element) => element instanceof HTMLElement)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const text = normalizeText(element.innerText ?? "");

        return {
          element,
          text,
          visible: rect.width > 0 && rect.height > 0,
          rectArea: Math.round(rect.width * rect.height),
          top: rect.top,
        };
      })
      .filter((candidate) => candidate.visible && candidate.text.length > 0)
      .sort((left, right) => left.top - right.top || right.text.length - left.text.length);

    const candidates = messageCandidates.length > 0 ? messageCandidates : articleCandidates;
    const best = candidates[0];
    const article = best?.element;
    const text = best?.text ?? "";
    const authorText = article?.querySelector("strong")?.textContent?.trim() || undefined;
    const timestampText = article?.querySelector('a[href*="/posts/"], a[href*="story_fbid"], a[href*="/permalink/"]')?.textContent?.trim() || undefined;

    return {
      text,
      authorText,
      timestampText,
      diagnostics: {
        usedArticleRole: Boolean(article?.matches('[role="article"]')),
        usedPostMessageSelector: messageCandidates.length > 0,
        messageCandidateCount: messageCandidates.length,
        articleCandidateCount: articleCandidates.length,
        candidateCount: candidates.length,
        longestCandidateLength: candidates[0]?.text.length ?? 0,
        secondCandidateLength: candidates[1]?.text.length ?? 0,
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
        await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await page.waitForTimeout(2_000);

        const extracted = await extractVisibleFacebookText(page);

        if (!extracted.text.trim()) {
          console.log(recordFacebookCaptureFailure(source.sourceId, extracted.diagnostics.usedArticleRole ? "no_visible_post_text" : "facebook_article_not_found"));
          continue;
        }

        const finalUrl = page.url();
        const metadata: SafeFacebookCaptureMetadata = {
          captureMethod: "playwright_operator_browser",
          capturedAt: new Date().toISOString(),
          sourceUrl,
          finalUrl,
          authorText: extracted.authorText,
          timestampText: extracted.timestampText,
          diagnostics: extracted.diagnostics,
        };

        const shouldSave = options.yes || (await confirmSave(source.sourceId, extracted.text));

        if (!shouldSave) {
          console.log(`Skipped ${source.sourceId}; database unchanged.`);
          continue;
        }

        const result = await updateQueuedFacebookSourceRawText(db, {
          sourceId: source.sourceId,
          rawText: extracted.text,
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
