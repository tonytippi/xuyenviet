import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("direct shell proposal actions", () => {
  test("uses the direct annotation command without exposing a proposal ID", () => {
    const source = readFileSync("apps/web/src/features/chat-trips/direct-shell-loader.tsx", "utf8");
    expect(source).toContain("executeDirectAnnotationProposalAction");
    expect(source).toContain("executeAnnotationAction={async (input)");
    expect(source).not.toContain("proposalId: input");
  });
});
