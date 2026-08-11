import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("direct shell proposal actions", () => {
  test("uses the direct annotation command without exposing a proposal ID", () => {
    const source = readFileSync("apps/web/src/features/chat-trips/direct-shell-loader.tsx", "utf8");
    expect(source).toContain("executeDirectAnnotationProposalAction");
    expect(source).toContain("executeAnnotationAction={async (input)");
    expect(source).not.toContain("proposalId: input");
  });

  test("keeps typed recommendation decisions URL-bound and server-authoritative", () => {
    const source = readFileSync("apps/web/src/features/ai/ai-ask-composer.tsx", "utf8");
    expect(source).toContain("loadTripRecommendations(confirmedOrdinaryConversationId)");
    expect(source).toContain("continueDirectInTrip({ decisionId, tripProjectId })");
    expect(source).toContain("acceptDirectTripCreationRecommendation(decisionId, key)");
    expect(source).toContain("chooseDirectPrivateTripRecommendation({ decisionId })");
    expect(source).toContain("declineDirectTripCreationRecommendation({ decisionId })");
    expect(source).toContain("router.push(buildCanonicalAiAskUrl(result.destination.conversationId, result.destination.tripProjectId))");
    expect(source).not.toContain("parse answer text");
  });

  test("keeps project management in navigation and preserves stale scoped URLs safely", () => {
    const loader = readFileSync("apps/web/src/features/chat-trips/direct-shell-loader.tsx", "utf8");
    const composer = readFileSync("apps/web/src/features/ai/ai-ask-composer.tsx", "utf8");
    expect(loader).toContain("Không thể mở chuyến đi này. Bạn có thể chọn một chuyến đi khác hoặc tiếp tục hỏi XuyenViet.");
    expect(loader).toContain("Replacing unmounts an active composer and aborts its stream.");
    expect(loader).not.toContain('router.replace("/ai-ask")');
    expect(composer).toContain("Tạo chuyến đi");
    expect(composer).toContain("Xóa chuyến đi này");
    expect(composer).toContain("focusAfterNavigationRef.current = \"composer\"");
    expect(composer).toContain("scopeSelectionOriginRef.current?.isConnected");
    expect(composer).not.toContain("Quản lý chuyến đi");
  });

  test("blocks interaction with an old shell during navigation and deduplicates project actions", () => {
    const loader = readFileSync("apps/web/src/features/chat-trips/direct-shell-loader.tsx", "utf8");
    const composer = readFileSync("apps/web/src/features/ai/ai-ask-composer.tsx", "utf8");
    expect(loader).toContain("setState((current) => ({ ...current, loading: true, recoveryNotice: undefined }))");
    expect(composer).toContain("creatingTripProjectRef.current");
    expect(composer).toContain("deletingTripProjectIdRef.current ||");
    expect(composer).toContain("handleStaleRecommendation()");
  });

  test("focuses the composer when the mobile heading is hidden on desktop", () => {
    const composer = readFileSync("apps/web/src/features/ai/ai-ask-composer.tsx", "utf8");
    expect(composer).toContain("mainHeadingRef.current?.offsetParent !== null ? mainHeadingRef.current : textareaRef.current");
  });

  test("private and decline recommendation actions preserve the unscoped URL without navigation", () => {
    const source = readFileSync("apps/web/src/features/ai/ai-ask-composer.tsx", "utf8");
    expect(source).toContain('setStatus("Bạn có thể tiếp tục hỏi riêng trong cuộc trò chuyện này.")');
    expect(source).toContain('setStatus("Đã ghi nhận lựa chọn của bạn.")');
    expect(source).toContain('router.push(buildCanonicalAiAskUrl(result.destination.conversationId, result.destination.tripProjectId))');
  });

  test("keeps the selected-trip label in the shared shell rather than only the empty state", () => {
    const source = readFileSync("apps/web/src/features/ai/ai-ask-composer.tsx", "utf8");
    const scopeLabel = source.indexOf("Đang lên kế hoạch cho: {selectedTripProject.title}");
    const emptyState = source.indexOf("{showEmptyState && !isHistoricReview ? (");
    expect(scopeLabel).toBeGreaterThan(-1);
    expect(emptyState).toBeGreaterThan(scopeLabel);
  });
});
