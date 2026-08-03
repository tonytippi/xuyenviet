import { describe, expect, test } from "vitest";

import { parseAnnotationProposalActionCommand, parseTripChangeProposalCommand } from "@xuyenviet/contracts";

describe("trip proposal command contracts", () => {
  test("accepts only exact matched annotation actions", () => {
    expect(parseAnnotationProposalActionCommand({ conversationId: "conversation-1", assistantMessageId: "message-1", annotationId: "trip-change-proposal-apply", command: "trip_change_proposal.apply" })).toMatchObject({ annotationId: "trip-change-proposal-apply" });
    expect(parseAnnotationProposalActionCommand({ conversationId: "conversation-1", assistantMessageId: "message-1", annotationId: "trip-change-proposal-apply", command: "trip_change_proposal.dismiss" })).toBeNull();
    expect(parseAnnotationProposalActionCommand({ conversationId: "conversation-1", assistantMessageId: "message-1", annotationId: "trip-change-proposal-dismiss", command: "trip_change_proposal.dismiss", proposalId: "forbidden" })).toBeNull();
  });

  test("rejects mismatched annotation bindings in proposal commands", () => {
    expect(parseTripChangeProposalCommand({ tripProjectId: "project-1", proposalId: "proposal-1", annotationBinding: { conversationId: "conversation-1", assistantMessageId: "message-1", annotationId: "trip-change-proposal-dismiss", command: "trip_change_proposal.apply" } })).toBeNull();
  });
});
