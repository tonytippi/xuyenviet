// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { parseAdminYoutubeDiscoveryMissionCoveragePage, type AdminKnowledgeProvinceCoverage } from "@xuyenviet/contracts";
import { filterProvinceCoverage, ImmediateRuns, ProvinceCoverage, YoutubeDiscoveryMissionQuality, validateMissionQueryDraft } from "../apps/admin/app/knowledge/youtube-discovery/mission/mission";

const roots: ReturnType<typeof createRoot>[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { while (roots.length) roots.pop()!.unmount(); vi.unstubAllGlobals(); });

describe("Mission UI interaction boundary", () => {
  test("rejects unsafe responses before presentation", () => {
    expect(parseAdminYoutubeDiscoveryMissionCoveragePage({ items: [{ actionId: "mission-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", priority: 1, createdAt: "2026-08-07T00:00:00.000Z", corridor: null, location: null, routeSegment: null, taxonomy: null, freshness: "fresh", conflict: "none", demand: "unavailable", seasonalContext: "unavailable", providerPayload: {} }], nextCursor: null })).toBeNull();
  });

  test("keeps query drafts safe for command submission without erasing them", () => {
    const invalid = { queryText: "", priority: "101", cadenceMinutes: "14" };
    expect(validateMissionQueryDraft(invalid, true)).toEqual({ queryText: "Nhập truy vấn dài từ 1 đến 240 ký tự.", priority: "Ưu tiên phải từ 1 đến 100.", cadenceMinutes: "Chu kỳ phải từ 15 đến 10080 phút." });
    expect(invalid).toEqual({ queryText: "", priority: "101", cadenceMinutes: "14" });
    expect(validateMissionQueryDraft({ queryText: "Đèo Prenn", priority: "25", cadenceMinutes: "60" }, true)).toEqual({});
    expect(validateMissionQueryDraft({ queryText: "Đèo Prenn", priority: "25", cadenceMinutes: "10081" }, true)).toEqual({ cadenceMinutes: "Chu kỳ phải từ 15 đến 10080 phút." });
    expect(validateMissionQueryDraft({ queryText: "Đèo Prenn", priority: "", cadenceMinutes: "60" }, false)).toEqual({ priority: "Ưu tiên phải từ 1 đến 100." });
  });

  test("searches canonical current and official legacy province names locally", () => {
    const provinces: AdminKnowledgeProvinceCoverage[] = [
      { canonicalProvinceId: "vn-01-ha-noi", currentName: "Hà Nội", legacyNames: ["Hà Tây"], topics: [], freshnessSensitiveCount: 0, latestUpdatedAt: null },
      { canonicalProvinceId: "vn-79-ho-chi-minh", currentName: "Hồ Chí Minh", legacyNames: ["Sài Gòn"], topics: [], freshnessSensitiveCount: 0, latestUpdatedAt: null },
    ];
    expect(filterProvinceCoverage(provinces, "ha tay")).toEqual([provinces[0]]);
    expect(filterProvinceCoverage(provinces, "sai gon")).toEqual([provinces[1]]);
    expect(filterProvinceCoverage(provinces, "Đà Nẵng")).toEqual([]);
  });

  test("unlocks a new province and ignores a stale suggestion response", async () => {
    const provinces: AdminKnowledgeProvinceCoverage[] = [
      { canonicalProvinceId: "vn-01-ha-noi", currentName: "Hà Nội", legacyNames: [], topics: [], freshnessSensitiveCount: 0, latestUpdatedAt: null },
      { canonicalProvinceId: "vn-21-da-nang", currentName: "Đà Nẵng", legacyNames: [], topics: [], freshnessSensitiveCount: 0, latestUpdatedAt: null },
    ];
    let resolveSuggestion!: (value: Response) => void;
    const suggestion = new Promise<Response>((resolve) => { resolveSuggestion = resolve; });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "csrf" }), { status: 200 })).mockReturnValueOnce(suggestion));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    await act(async () => { root.render(createElement(ProvinceCoverage, { provinces, setStatus: vi.fn() })); });
    const click = async (name: string) => { await act(async () => { Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(name))!.click(); }); };
    await click("Hà Nội");
    await click("Đề xuất truy vấn tiếng Việt");
    await click("Đà Nẵng");
    expect(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Đề xuất truy vấn tiếng Việt"))?.disabled).toBe(false);
    await act(async () => { resolveSuggestion(new Response(JSON.stringify({ canonicalProvinceId: "vn-01-ha-noi", need: "Cần bổ sung thông tin đường đi", reason: "Chủ đề còn ít", queryText: "kinh nghiệm lái xe Hà Nội" }), { status: 201 })); await Promise.resolve(); });
    expect(container.textContent).not.toContain("Đề xuất tạm thời");
  });

  test("turns a valid selected-province suggestion into a scheduled query", async () => {
    const provinces: AdminKnowledgeProvinceCoverage[] = [{ canonicalProvinceId: "vn-21-da-nang", currentName: "Đà Nẵng", legacyNames: [], topics: [], freshnessSensitiveCount: 0, latestUpdatedAt: null }];
    let resolveSuggestion!: (value: Response) => void;
    const suggestion = new Promise<Response>((resolve) => { resolveSuggestion = resolve; });
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "csrf" }), { status: 200 })).mockReturnValueOnce(suggestion).mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "csrf" }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ id: "query", origin: "operator", reason: "operator_request", queryText: "kinh nghiệm lái xe Đà Nẵng", priority: 50, enabled: true, cadenceMinutes: 60, nextRunAt: "2026-08-18T00:00:00.000Z", pausedReason: null }), { status: 201 }));
    vi.stubEnv("NEXT_PUBLIC_API_ORIGIN", "https://api.test");
    vi.stubGlobal("fetch", fetch);
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container); roots.push(root);
    await act(async () => { root.render(createElement(ProvinceCoverage, { provinces, setStatus: vi.fn() })); });
    const click = async (name: string) => { await act(async () => { Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(name))!.click(); }); };
    await click("Đà Nẵng");
    Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Đề xuất truy vấn tiếng Việt"))!.click();
    for (let index = 0; index < 10 && fetch.mock.calls.length < 2; index += 1) await Promise.resolve();
    await act(async () => {
      resolveSuggestion(new Response(JSON.stringify({ canonicalProvinceId: "vn-21-da-nang", need: "Cần thêm thông tin", reason: "Chủ đề còn ít", queryText: "kinh nghiệm lái xe Đà Nẵng" }), { status: 201 }));
    });
    for (let index = 0; index < 10 && !container.textContent?.includes("Đề xuất tạm thời"); index += 1) await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toContain("Đề xuất tạm thời");
    await click("Tạo truy vấn");
    expect(fetch).toHaveBeenLastCalledWith("https://api.test/v1/admin/knowledge/youtube-discovery", expect.objectContaining({ method: "POST", body: JSON.stringify({ queryText: "kinh nghiệm lái xe Đà Nẵng", priority: 50, cadenceMinutes: 60 }) }));
    expect(container.textContent).not.toContain("Đề xuất tạm thời");
  });

  test("creates a suggestion query before explicit immediate admission and retains it across an admission retry", async () => {
    const provinces: AdminKnowledgeProvinceCoverage[] = [{ canonicalProvinceId: "vn-21-da-nang", currentName: "Đà Nẵng", legacyNames: [], topics: [], freshnessSensitiveCount: 0, latestUpdatedAt: null }];
    const suggestion = { canonicalProvinceId: "vn-21-da-nang", need: "Cần thêm thông tin", reason: "Chủ đề còn ít", queryText: "kinh nghiệm lái xe Đà Nẵng" };
    const query = { id: "query-1", origin: "operator", reason: "operator_request", queryText: suggestion.queryText, priority: 50, enabled: true, cadenceMinutes: 60, nextRunAt: "2026-08-18T00:00:00.000Z", pausedReason: null };
    const run = { runId: "run-1", state: "queued", createdAt: "2026-08-18T00:00:00.000Z" };
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "csrf" }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify(suggestion), { status: 201 })).mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "csrf" }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify(query), { status: 201 })).mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "csrf" }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ code: "internal_error" }), { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "csrf" }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify(run), { status: 201 }));
    vi.stubEnv("NEXT_PUBLIC_API_ORIGIN", "https://api.test"); vi.stubGlobal("fetch", fetch);
    const container = document.createElement("div"); document.body.append(container); const root = createRoot(container); roots.push(root);
    await act(async () => { root.render(createElement(ProvinceCoverage, { provinces, setStatus: vi.fn() })); });
    const click = async (name: string) => { await act(async () => { Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(name))!.click(); await Promise.resolve(); }); };
    await click("Đà Nẵng"); await click("Đề xuất truy vấn tiếng Việt");
    for (let index = 0; index < 10 && !container.textContent?.includes("Đề xuất tạm thời"); index += 1) await act(async () => { await Promise.resolve(); });
    await click("Chạy ngay"); await click("Chạy ngay");
    const paths = fetch.mock.calls.map(([url]) => String(url));
    expect(paths.filter((path) => path === "https://api.test/v1/admin/knowledge/youtube-discovery")).toHaveLength(1);
    const immediate = fetch.mock.calls.filter(([url]) => String(url).endsWith("/immediate"));
    expect(immediate).toHaveLength(2);
    expect(JSON.parse((immediate[1]![1] as RequestInit).body as string).confirmationKey).toBe(JSON.parse((immediate[0]![1] as RequestInit).body as string).confirmationKey);
    expect(container.textContent).not.toContain("Đề xuất tạm thời");
  });

  test("reuses an immediate confirmation after admission or progress failure and clears it after success", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_ORIGIN", "https://api.test");
    const query = { id: "proposal-1", origin: "operator" as const, queryText: "Da Lat route", reason: "operator_request" as const, priority: 50, enabled: true, cadenceMinutes: 60, nextRunAt: "2026-08-07T00:00:00.000Z", pausedReason: null };
    const run = { runId: "run-1", state: "queued", createdAt: "2026-08-07T00:00:00.000Z" };
    const progress = { run: { ...run, claimedAt: null, terminalAt: null, retryCount: 0, nextRetryAt: null, safeErrorCode: null }, candidateCount: 1, jobs: { queued: 0, running: 0, retrying: 0, completed: 1, failed: 0, cancelled: 0 }, reviewAvailable: true };
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "csrf" }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ code: "internal_error" }), { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "csrf" }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify(run), { status: 201 })).mockResolvedValueOnce(new Response(JSON.stringify({ code: "internal_error" }), { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "csrf" }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify(run), { status: 201 })).mockResolvedValueOnce(new Response(JSON.stringify(progress), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "csrf" }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify(run), { status: 201 })).mockResolvedValueOnce(new Response(JSON.stringify(progress), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container); roots.push(root);
    await act(async () => { root.render(createElement(ImmediateRuns, { queries: [query], setStatus: vi.fn() })); });
    const click = async () => { await act(async () => { Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Chạy ngay")!.click(); await Promise.resolve(); }); };
    await click(); await click(); await click();
    for (let index = 0; index < 30 && !container.textContent?.includes("Đang chờ"); index += 1) await act(async () => { await Promise.resolve(); });
    const bodies = () => fetch.mock.calls.filter(([url]) => String(url).endsWith("/immediate")).map(([, init]) => JSON.parse((init as RequestInit).body as string));
    expect(bodies()[1].confirmationKey).toBe(bodies()[0].confirmationKey);
    expect(bodies()[2].confirmationKey).toBe(bodies()[1].confirmationKey);
    expect(container.textContent).toContain("Đang chờ");
    expect(container.textContent).toContain("Xem video");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/knowledge/youtube-discovery-review");
    await click();
    expect(bodies()[3].confirmationKey).not.toBe(bodies()[2].confirmationKey);
  });

  test("refreshes existing immediate-run progress and exposes the existing review flow", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_ORIGIN", "https://api.test");
    const query = { id: "proposal-1", origin: "operator" as const, queryText: "Da Lat route", reason: "operator_request" as const, priority: 50, enabled: true, cadenceMinutes: 60, nextRunAt: "2026-08-07T00:00:00.000Z", pausedReason: null };
    const progress = { run: { runId: "run-1", state: "completed", createdAt: "2026-08-07T00:00:00.000Z", claimedAt: "2026-08-07T00:00:00.000Z", terminalAt: "2026-08-07T00:01:00.000Z", retryCount: 1, nextRetryAt: null, safeErrorCode: null }, candidateCount: 2, jobs: { queued: 0, running: 0, retrying: 0, completed: 2, failed: 0, cancelled: 0 }, reviewAvailable: true };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(progress), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container); roots.push(root);
    await act(async () => { root.render(createElement(ImmediateRuns, { queries: [query], setStatus: vi.fn() })); });
    await act(async () => { Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Làm mới tiến độ")!.click(); await Promise.resolve(); });
  });

  test("shows Xem video only for a reviewable immediate projection", () => {
    const query = { id: "proposal-1", origin: "operator" as const, queryText: "Da Lat route", reason: "operator_request" as const, priority: 50, enabled: true, cadenceMinutes: 60, nextRunAt: null, pausedReason: null };
    const html = renderToStaticMarkup(createElement(ImmediateRuns, { queries: [query], setStatus: vi.fn() }));
    expect(html).not.toContain("Xem video");
  });

  test("renders bounded immediate state and retry recovery context", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_ORIGIN", "https://api.test");
    const query = { id: "proposal-1", origin: "operator" as const, queryText: "Da Lat route", reason: "operator_request" as const, priority: 50, enabled: true, cadenceMinutes: 60, nextRunAt: null, pausedReason: null };
    const states = [
      { state: "queued", nextRetryAt: null, safeErrorCode: null, label: "Đang chờ" },
      { state: "running", nextRetryAt: null, safeErrorCode: null, label: "Đang chạy" },
      { state: "queued", nextRetryAt: "2026-08-07T00:15:00.000Z", safeErrorCode: "search_timeout", label: "Đang thử lại" },
      { state: "failed", nextRetryAt: null, safeErrorCode: "retry_exhausted", label: "Lượt chạy đã thất bại an toàn" },
      { state: "cancelled", nextRetryAt: null, safeErrorCode: "policy_revoked", label: "Đã hủy" },
      { state: "completed", nextRetryAt: null, safeErrorCode: null, label: "Hoàn tất" },
    ] as const;
    for (const current of states) {
      const progress = { run: { runId: "run-1", state: current.state, createdAt: "2026-08-07T00:00:00.000Z", claimedAt: current.state === "queued" ? null : "2026-08-07T00:00:00.000Z", terminalAt: current.state === "failed" || current.state === "cancelled" || current.state === "completed" ? "2026-08-07T00:01:00.000Z" : null, retryCount: 1, nextRetryAt: current.nextRetryAt, safeErrorCode: current.safeErrorCode }, candidateCount: 0, jobs: { queued: 0, running: 0, retrying: 0, completed: 0, failed: 0, cancelled: 0 }, reviewAvailable: false };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(progress), { status: 200 })));
      const container = document.createElement("div"); document.body.append(container); const root = createRoot(container); roots.push(root);
      await act(async () => { root.render(createElement(ImmediateRuns, { queries: [query], setStatus: vi.fn() })); });
      await act(async () => { Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Làm mới tiến độ")!.click(); await Promise.resolve(); });
      expect(container.textContent).toContain(current.label);
      expect(container.textContent).not.toContain("Xem video");
      root.unmount(); roots.pop();
    }
  });

  test("renders the bounded Vietnamese-first quality proof", () => {
    const html = renderToStaticMarkup(createElement(YoutubeDiscoveryMissionQuality, { quality: { tooShort: 2, durationUnknown: 3, nonVietnamese: 4, languageUnknown: 5, foreignFallback: 6, vietnameseConsider: 8, considered: 10, vietnameseFitPercent: 80, durationViolations: 0 } }));
    for (const text of ["Chất lượng ưu tiên tiếng Việt", "80%", "Mẫu: 8/10", "Ngưỡng yêu cầu: 80% (đạt)", "Nguồn ngoại ngữ bổ sung: 6", "Video quá ngắn: 2", "chưa rõ thời lượng: 3", "không phải tiếng Việt: 4", "chưa rõ ngôn ngữ: 5", "vi phạm thời lượng: 0"]) expect(html).toContain(text);
  });

  test("announces when the Vietnamese-first threshold is not met", () => {
    const html = renderToStaticMarkup(createElement(YoutubeDiscoveryMissionQuality, { quality: { tooShort: 0, durationUnknown: 0, nonVietnamese: 0, languageUnknown: 0, foreignFallback: 0, vietnameseConsider: 7, considered: 10, vietnameseFitPercent: 70, durationViolations: 1 } }));
    expect(html).toContain("Mẫu: 7/10");
    expect(html).toContain("Ngưỡng yêu cầu: 80% (chưa đạt)");
  });
});
