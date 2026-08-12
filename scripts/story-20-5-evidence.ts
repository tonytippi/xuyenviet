import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

type Evidence = { flow: string; viewport: string; outcome: "pass" | "fail" | "skipped"; detail: string; timestamp: string };

const adminOrigin = localUrl("STORY_20_5_ADMIN_ORIGIN");
const apiOrigin = localUrl("STORY_20_5_API_ORIGIN");
const fixtureId = required("STORY_20_5_FIXTURE_ID");
const cookieName = required("STORY_20_5_SESSION_COOKIE_NAME");
const cookieValue = required("STORY_20_5_SESSION_COOKIE_VALUE");
const recommendationId = required("STORY_20_5_RECOMMENDATION_ID");
const missionActionId = required("STORY_20_5_MISSION_ACTION_ID");
const incidentActionId = required("STORY_20_5_INCIDENT_ACTION_ID");
const allowEnablementToggle = process.env.STORY_20_5_ALLOW_ENABLEMENT_TOGGLE === "1";
const output = join(process.cwd(), "_bmad-output/implementation-artifacts/evidence/story-20-5");
const evidence: Evidence[] = [];

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for controlled Story 20.5 evidence.`);
  return value;
}

function localUrl(name: string) {
  const value = required(name);
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) throw new Error(`${name} must target a controlled local runtime.`);
  return url.origin;
}

function record(flow: string, viewport: string, outcome: Evidence["outcome"], detail: string) {
  evidence.push({ flow, viewport, outcome, detail, timestamp: new Date().toISOString() });
}

async function snapshot(page: Page, label: string) {
  await page.screenshot({ path: join(output, `${label}.png`), fullPage: false });
}

async function accessibility(page: Page, label: string, viewport: string) {
  const result = await page.evaluate(() => {
    const controls = [...document.querySelectorAll<HTMLElement>("main button, main a[href], main input, main textarea")]
      .filter((element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; })
      .map((element) => { const rect = element.getBoundingClientRect(); return { name: element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 80) ?? element.tagName, width: Math.round(rect.width), height: Math.round(rect.height) }; });
    return { documentWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth, below44: controls.filter((control) => control.height < 44), politeStatuses: document.querySelectorAll('[role="status"][aria-live="polite"]').length };
  });
  record(`${label}: sequential reflow`, viewport, result.documentWidth <= result.viewportWidth ? "pass" : "fail", `document ${result.documentWidth}px / viewport ${result.viewportWidth}px`);
  record(`${label}: 44px targets`, viewport, result.below44.length === 0 ? "pass" : "fail", result.below44.map((control) => `${control.name} ${control.width}x${control.height}`).join("; "));
  record(`${label}: polite status`, viewport, result.politeStatuses > 0 ? "pass" : "fail", `${result.politeStatuses} region(s)`);
  await snapshot(page, `${viewport}-${label}`);
}

async function navigate(page: Page, path: string, heading: string, label: string, viewport: string) {
  await page.goto(`${adminOrigin}${path}`, { waitUntil: "networkidle" });
  const target = page.getByRole("heading", { name: heading }).first();
  const visible = await target.isVisible().catch(() => false);
  record(`${label}: reachable`, viewport, visible ? "pass" : "fail", visible ? `runtime URL ${page.url()}` : `heading ${heading} unavailable at ${page.url()}`);
  if (visible) {
    await target.focus();
    const focused = await page.evaluate(() => document.activeElement?.tagName === "H1" || document.activeElement?.tagName === "H2");
    record(`${label}: keyboard focus`, viewport, focused ? "pass" : "fail", focused ? "heading focused" : "heading did not receive focus");
  }
  await accessibility(page, label, viewport);
}

async function runViewport(viewport: { width: number; height: number }, label: string) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addCookies([{ name: cookieName, value: cookieValue, domain: new URL(adminOrigin).hostname, path: "/", httpOnly: true, sameSite: "Lax", secure: false }]);
  const page = await context.newPage();
  const apiRequests = new Set<string>();
  page.on("request", (request) => { if (request.url().startsWith(apiOrigin)) apiRequests.add(request.url()); });
  try {
    await navigate(page, "/knowledge/youtube-discovery", "Việc cần xử lý", "action-queue", label);
    const action = page.getByRole("link", { name: "Mở việc này" }).first();
    if (await action.isVisible().catch(() => false)) { await action.focus(); await page.keyboard.press("Enter"); await page.waitForURL((url) => url.pathname !== "/knowledge/youtube-discovery"); record("action-queue: destination keyboard activation", label, "pass", `runtime URL ${page.url()}`); } else record("action-queue: destination keyboard activation", label, "fail", "controlled fixture did not expose an action item");
    await navigate(page, `/knowledge/youtube-discovery-review?recommendationId=${encodeURIComponent(recommendationId)}`, "Xem xét ứng viên", "review", label);
    if (label === "desktop") { const accept = page.getByRole("button", { name: "Chấp nhận vào Knowledge" }); if (await accept.isVisible().catch(() => false)) { await accept.focus(); await page.keyboard.press("Enter"); const status = page.getByRole("status").first(); await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some((element) => element.textContent?.includes("Knowledge") ?? false)); record("review: accept reconciliation", label, "pass", (await status.textContent()) ?? ""); } else record("review: accept reconciliation", label, "fail", "controlled fixture did not expose Accept"); }
    await navigate(page, "/knowledge/youtube-discovery/mission?view=queries", "Nhu cầu Discovery", "mission", label);
    const query = page.getByRole("textbox", { name: "Truy vấn mới" });
    const create = page.getByRole("button", { name: "Tạo truy vấn" });
    if (await query.isVisible().catch(() => false) && await create.isVisible().catch(() => false)) { await query.fill(""); await create.press("Enter"); await page.waitForFunction((element) => document.activeElement === element, await query.elementHandle()); record("mission: invalid query focus", label, await query.evaluate((element) => document.activeElement === element) ? "pass" : "fail", "empty draft returned focus to the invalid query input"); }
    await navigate(page, `/knowledge/youtube-discovery/mission/${encodeURIComponent(missionActionId)}`, "Dấu vết nhu cầu Discovery", "mission-detail", label);
    await navigate(page, "/knowledge/youtube-discovery/health", "Sức khỏe Discovery", "health", label);
    await navigate(page, `/knowledge/youtube-discovery/health/${encodeURIComponent(incidentActionId)}`, "Chi tiết sự cố Discovery", "health-incident", label);
    if (allowEnablementToggle) {
      await navigate(page, "/knowledge/youtube-discovery/health", "Sức khỏe Discovery", "enablement", label);
      const toggle = page.getByRole("button", { name: /^(Tắt|Bật) Discovery$/ }); const initialLabel = await toggle.textContent();
      await toggle.focus(); await page.keyboard.press("Enter");
      const status = page.getByRole("status").last(); await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some((element) => element.textContent?.includes("Discovery đã") ?? false));
      record("enablement: confirmed status", label, await status.textContent().then((text) => text?.includes("Discovery đã") ?? false) ? "pass" : "fail", (await status.textContent()) ?? "no status");
      if (initialLabel) { const restore = page.getByRole("button", { name: initialLabel }); const restoredStatus = initialLabel === "Tắt Discovery" ? "Discovery đã bật." : "Discovery đã tắt."; await restore.focus(); await page.keyboard.press("Enter"); await page.waitForFunction((text) => [...document.querySelectorAll('[role="status"]')].some((element) => element.textContent?.includes(text) ?? false), restoredStatus); }
    } else record("enablement: controlled toggle", label, "skipped", "Set STORY_20_5_ALLOW_ENABLEMENT_TOGGLE=1 only for a disposable fixture.");
    record("api runtime admission", label, apiRequests.size > 0 ? "pass" : "fail", apiRequests.size > 0 ? `browser requested ${apiOrigin}` : `no browser request reached ${apiOrigin}`);
  } catch (error) { record("viewport runtime", label, "fail", error instanceof Error ? error.message : "unknown error"); }
  finally { await browser.close(); }
}

async function main() {
  mkdirSync(output, { recursive: true });
  record("evidence metadata", "meta", "pass", `fixture=${fixtureId}; admin=${adminOrigin}; api=${apiOrigin}; narrow method=320 CSS pixels (400%-zoom-equivalent reflow)`);
  const browser = await chromium.launch({ headless: true });
  record("browser version", "meta", "pass", await browser.version());
  await browser.close();
  await runViewport({ width: 1440, height: 900 }, "desktop");
  await runViewport({ width: 320, height: 900 }, "narrow-320");
  writeFileSync(join(output, "accessibility-matrix.json"), JSON.stringify(evidence, null, 2));
  if (evidence.some((entry) => entry.outcome === "fail")) process.exitCode = 1;
}

void main();
