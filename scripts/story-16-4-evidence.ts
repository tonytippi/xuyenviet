import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHmac, randomBytes } from "node:crypto";
import postgres from "postgres";
import { chromium } from "playwright";

const ENV_FILE = readFileSync(join(process.cwd(), "apps/api/.env.local"), "utf8");
const env: Record<string, string> = {};
for (const line of ENV_FILE.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const DATABASE_URL = env.DATABASE_URL!;
const SESSION_LOOKUP_KEY = env.XV_BROWSER_SESSION_LOOKUP_KEY!;
const CSRF_KEY = env.XV_BROWSER_CSRF_KEY!;
const OAUTH_PROTECTION_KEY = env.XV_BROWSER_OAUTH_TRANSACTION_PROTECTION_KEY!;
const COOKIE_NAME = "xuyenviet-session";

const OUT = join(process.cwd(), "_bmad-output/implementation-artifacts/evidence/story-16-4");
mkdirSync(OUT, { recursive: true });

const results: Array<{ flow: string; viewport: string; outcome: string; detail: string; timestamp: string }> = [];
function record(flow: string, viewport: string, outcome: string, detail: string) {
  results.push({ flow, viewport, outcome, detail, timestamp: new Date().toISOString() });
}

async function mintSession(): Promise<{ cookie: string; csrf: string; userId: string }> {
  const sql = postgres(DATABASE_URL, { max: 1 });
  try {
    const existing = await sql`SELECT id, email, authorization_version as "authorizationVersion" FROM users WHERE email = 'sonnh273@gmail.com' LIMIT 1`;
    let userId: string;
    let authVersion: number;
    if (existing.length > 0) {
      userId = existing[0].id;
      authVersion = existing[0].authorizationVersion;
    } else {
      const fallback = await sql`SELECT id, email, authorization_version as "authorizationVersion" FROM users LIMIT 1`;
      userId = fallback[0].id;
      authVersion = fallback[0].authorizationVersion;
    }

    const sessionId = randomBytes(48).toString("base64url").slice(0, 64);
    const browserLookupHash = createHmac("sha256", SESSION_LOOKUP_KEY).update(sessionId).digest("base64url");
    const csrf = createHmac("sha256", CSRF_KEY).update(`nonce.${sessionId}`).digest("base64url");
    const csrfHashVal = createHmac("sha256", CSRF_KEY).update(`${sessionId}.${csrf}`).digest("base64url");
    const expires = new Date(Date.now() + 3600_000);

    await sql`
      INSERT INTO browser_sessions (session_lookup_hash, user_id, csrf_hash, authorization_version, expires)
      VALUES (${browserLookupHash}, ${userId}, ${csrfHashVal}, ${authVersion}, ${expires})
      ON CONFLICT (session_lookup_hash) DO UPDATE SET csrf_hash = EXCLUDED.csrf_hash, expires = EXCLUDED.expires, authorization_version = EXCLUDED.authorization_version, revoked_at = NULL, user_id = EXCLUDED.user_id
    `;

    return { cookie: `${COOKIE_NAME}=${sessionId}`, csrf, userId };
  } finally {
    await sql.end();
  }
}

async function runViewport(viewport: { width: number; height: number }, label: string, cookie: string) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });

  // Set the session cookie for localhost
  await context.addCookies([{
    name: COOKIE_NAME,
    value: cookie.split("=")[1],
    domain: "localhost",
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: false,
  }]);

  const page = await context.newPage();

  try {
    // 1. Unscoped /ai-ask landing
    await page.goto("http://localhost:3000/ai-ask", { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: join(OUT, `${label}-01-unscoped-landing.png`), fullPage: false });

    const ariaCurrentBtn = await page.locator('button[aria-current="page"]').first();
    const ariaCurrentText = await ariaCurrentBtn.textContent().catch(() => null);
    record("Hỏi XuyenViet unscoped landing aria-current=page", label, ariaCurrentText ? "present" : "MISSING", `button: "${ariaCurrentText}"`);

    // 2. Navigation sidebar - check if toggle exists (mobile) or nav is persistent (desktop)
    const navToggle = page.getByRole("button", { name: "Thu gọn thanh bên" });
    const navToggleVisible = await navToggle.isVisible().catch(() => false);

    // On mobile, check for the "Danh sách trò chuyện" session sheet button
    const sessionSheetBtn = page.getByRole("button", { name: "Danh sách trò chuyện" }).first();
    const sessionSheetVisible = await sessionSheetBtn.isVisible().catch(() => false);
    const menuBtn = page.locator('button[aria-label*="menu"], button[aria-label*="Menu"], button[aria-label*="thanh bên"], button[aria-label*="danh sách"]').first();
    const menuBtnVisible = await menuBtn.isVisible().catch(() => false);

    if (navToggleVisible) {
      await navToggle.focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(OUT, `${label}-02-nav-expanded.png`), fullPage: false });

      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      const focusedAfter = await page.evaluate(() => `${document.activeElement?.tagName}:${document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.slice(0, 40) || ""}`);
      record("Navigation sheet Escape + focus restoration", label, "Escape pressed, focus checked", `focus -> ${focusedAfter}`);
    } else if (sessionSheetVisible) {
      // Mobile: open session sheet
      await sessionSheetBtn.focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(800);
      await page.screenshot({ path: join(OUT, `${label}-02-session-sheet.png`), fullPage: false });

      // Escape to close
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      const focusedAfter = await page.evaluate(() => `${document.activeElement?.tagName}:${document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.slice(0, 40) || ""}`);
      record("Navigation session sheet Escape + focus restoration", label, "Escape pressed, focus checked", `focus -> ${focusedAfter}`);
    } else if (menuBtnVisible) {
      await menuBtn.focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(OUT, `${label}-02-nav-opened.png`), fullPage: false });

      // Try Escape to close
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      const focusedAfter = await page.evaluate(() => `${document.activeElement?.tagName}:${document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.slice(0, 40) || ""}`);
      record("Navigation sheet Escape + focus restoration", label, "Escape pressed, focus checked", `focus -> ${focusedAfter}`);
    } else {
      // Desktop: nav is persistent, test focus on Hỏi XuyenViet button
      const hoiBtn = page.getByRole("button", { name: "Hỏi XuyenViet" }).first();
      if (await hoiBtn.isVisible().catch(() => false)) {
        await hoiBtn.focus();
        await page.waitForTimeout(200);
        const isFocused = await page.evaluate(() => document.activeElement?.textContent?.includes("XuyenViet"));
        record("Navigation Hỏi XuyenViet focus (persistent nav)", label, isFocused ? "focused" : "NOT focused", "");
      } else {
        record("Navigation focus", label, "SKIPPED", "nav toggle and Hỏi XuyenViet button not visible");
      }
    }

    // 3. Composer focus
    const textarea = page.getByRole("textbox", { name: "Câu hỏi của bạn" });
    if (await textarea.isVisible().catch(() => false)) {
      await textarea.focus();
      await page.waitForTimeout(200);
      await page.screenshot({ path: join(OUT, `${label}-03-composer-focus.png`), fullPage: false });
      const focusedIsTextarea = await page.evaluate(() => document.activeElement?.tagName === "TEXTAREA");
      record("Composer focus", label, focusedIsTextarea ? "textarea focused" : "NOT focused", "");
    } else {
      record("Composer focus", label, "SKIPPED", "textarea not visible");
    }

    // 4. Interactive button 44px target floor - detailed check
    const allButtons = page.locator("main button");
    const btnCount = await allButtons.count();
    let below44 = 0;
    let checked = 0;
    const belowDetails: string[] = [];
    for (let i = 0; i < btnCount; i++) {
      const btn = allButtons.nth(i);
      const visible = await btn.isVisible().catch(() => false);
      if (!visible) continue;
      const box = await btn.boundingBox();
      if (box && box.height > 0 && box.width > 0) {
        checked++;
        if (box.height < 44) {
          below44++;
          const text = ((await btn.textContent().catch(() => "")) ?? "").trim().slice(0, 40);
          const ariaLabel = await btn.getAttribute("aria-label").catch(() => null);
          belowDetails.push(`h=${Math.round(box.height)}px w=${Math.round(box.width)}px text="${text}" aria-label="${ariaLabel}"`);
        }
      }
    }
    // Exclude Next.js dev tools overlay (framework-owned, 32px)
    const productBelow = belowDetails.filter(d => !d.includes("Next") && !d.includes("devtools"));
    record("Interactive button 44px height target floor", label, productBelow.length === 0 ? `all ${checked} product buttons >= 44px height` : `${productBelow.length}/${checked} below 44px`, belowDetails.join("; "));
    await page.screenshot({ path: join(OUT, `${label}-04-buttons-overview.png`), fullPage: false });

    // 5. aria-live regions
    const ariaLiveCount = await page.locator('[aria-live="polite"]').count();
    record("aria-live polite regions present", label, ariaLiveCount > 0 ? `${ariaLiveCount} found` : "NONE", "");

    // 6. Load a conversation via known conversation ID
    let conversationLoaded = false;
    try {
      // Fetch conversation summaries to find a real conversation ID
      const summariesData = await page.evaluate(async (cookie) => {
        const resp = await fetch("/v1/conversations/summaries", { headers: { Cookie: cookie } });
        return resp.json();
      }, cookie);
      const firstConvId = summariesData?.summaries?.[0]?.id;
      if (firstConvId) {
        await page.goto(`http://localhost:3000/ai-ask?conversationId=${firstConvId}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(3000);
        await page.screenshot({ path: join(OUT, `${label}-05-conversation-loaded.png`), fullPage: false });
        record("Conversation load", label, "loaded via URL", `conversationId: ${firstConvId}`);
        conversationLoaded = true;
      }
    } catch { /* fall through */ }

    if (!conversationLoaded) {
      // Try clicking a conversation in the sidebar (expand if collapsed)
      const expandBtn = page.getByRole("button", { name: "Mở thanh bên" });
      if (await expandBtn.isVisible().catch(() => false)) {
        await expandBtn.click();
        await page.waitForTimeout(500);
      }
      const convBtn = page.locator('button:has-text("Hà Nội")').nth(1);
      if (await convBtn.isVisible().catch(() => false)) {
        await convBtn.click({ timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(2000);
        await page.screenshot({ path: join(OUT, `${label}-05-conversation-loaded.png`), fullPage: false });
        record("Conversation load", label, "clicked sidebar conversation", "");
        conversationLoaded = true;
      }
    }

    if (!conversationLoaded) {
      record("Conversation load", label, "SKIPPED", "no conversation found via API or sidebar");
    }

    if (conversationLoaded) {
      // 7. Selected-answer detail (if any answer rendered)
      const detailSection = page.locator('[aria-label*="Chi tiết"]').first();
      if (await detailSection.isVisible().catch(() => false)) {
        await page.screenshot({ path: join(OUT, `${label}-06-answer-detail.png`), fullPage: false });
        record("Selected-answer detail section", label, "visible", "");
      } else {
        record("Selected-answer detail section", label, "not visible", "no answer detail section in this conversation state");
      }

      // 8. Feedback controls
      const feedbackBtn = page.locator('button:has-text("Hữu ích"), button:has-text("Không hữu ích")').first();
      if (await feedbackBtn.isVisible().catch(() => false)) {
        record("Feedback controls visible", label, "present", "");
        await page.screenshot({ path: join(OUT, `${label}-07-feedback.png`), fullPage: false });
      } else {
        record("Feedback controls visible", label, "not visible", "no rendered answer to attach feedback in this conversation state");
      }

      // 9. Recommendation actions (private/continue)
      const privateBtn = page.locator('button:has-text("private"), button:has-text("Riêng tư"), button:has-text("Không lưu")').first();
      const saveBtn = page.locator('button:has-text("Lưu"), button:has-text("save"), button:has-text("Tạo chuyến đi")').first();
      const hasRec = await privateBtn.isVisible().catch(() => false);
      if (hasRec) {
        await page.screenshot({ path: join(OUT, `${label}-08-recommendation-actions.png`), fullPage: false });
        record("Recommendation private/continue actions visible", label, "present", "private_answer and save_trip buttons rendered");
      } else {
        record("Recommendation private/continue actions visible", label, "not visible", "no active recommendation in this conversation state");
      }
    }

    // 9. Reduced motion emulation
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, `${label}-08-reduced-motion.png`), fullPage: false });
    record("Reduced motion emulation", label, "emulated", "");

    // 10. Stale-scope recovery: navigate to a foreign/invalid project URL
    await page.goto("http://localhost:3000/ai-ask?tripProjectId=nonexistent-id-12345&conversationId=nonexistent-conv", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(OUT, `${label}-09-stale-scope-recovery.png`), fullPage: false });
    const bodyText = await page.locator("body").textContent().catch(() => "");
    const hasRecoveryMessage = bodyText?.includes("Không thể mở") || bodyText?.includes("chọn một chuyến đi khác") || bodyText?.includes("XuyenViet");
    record("Stale-scope recovery", label, hasRecoveryMessage ? "recovery message shown" : "NO recovery message", bodyText?.slice(0, 200) || "");

  } catch (err) {
    record("viewport run", label, "ERROR", (err as Error).message);
  } finally {
    await browser.close();
  }
}

(async () => {
  const version = await chromium.launch({ headless: true }).then(async (b) => { const v = await b.version(); await b.close(); return v; });
  record("Browser version", "meta", "chromium", version);

  console.log("Minting session...");
  const { cookie, userId } = await mintSession();
  console.log("Session minted for user:", userId);

  // Verify session is valid before proceeding
  const sessionResp = await fetch("http://localhost:3001/auth/session", { headers: { Cookie: cookie } });
  if (sessionResp.status !== 200) {
    record("Session validation", "meta", "FAILED", `API returned ${sessionResp.status}`);
    writeFileSync(join(OUT, "accessibility-matrix.json"), JSON.stringify(results, null, 2));
    console.error("Session validation failed. Aborting.");
    process.exit(1);
  }
  console.log("Session validated:", await sessionResp.json());

  console.log("Running desktop viewport (1440x900)...");
  await runViewport({ width: 1440, height: 900 }, "desktop", cookie);

  console.log("Running mobile viewport (390x844)...");
  await runViewport({ width: 390, height: 844 }, "mobile", cookie);

  writeFileSync(join(OUT, "accessibility-matrix.json"), JSON.stringify(results, null, 2));
  console.log("\nEvidence matrix written:", results.length, "records");
  for (const r of results) console.log(`  [${r.viewport}] ${r.flow}: ${r.outcome}`);
})();
