- source_spec: `{project-root}/_bmad-output/implementation-artifacts/spec-1-6-environment-and-public-launch-safety-baseline.md`
  summary: Add automated tests for environment safety guards when the repository has a test framework.
  evidence: Story 1.6 added production placeholder, APP_ENV, and database URL guard behavior that is currently verified by CLI checks because no unit or integration test framework exists yet.
  status: resolved
  resolved_on: 2026-07-06
  resolved_by: Story 2.0 (Epic 1 retrospective 2026-07-06 authorized insertion of Story 2.0 to introduce test framework and retroactive Epic 1 coverage)
- source_spec: `spec-2-5-continue-conversation-with-context.md`
  summary: Harden concurrent continuation submissions for the same conversation.
  evidence: Review found two tabs can submit to the same conversation at once; both requests may read the same prior history before either sees the other in-flight turn, creating stale-context assistant replies despite persisted ordering.
- source_spec: `spec-2-7-stream-ai-ask-responses-and-accept-traveler-image-input.md`
  summary: Add platform-level multipart/body-size enforcement for AI Ask streaming uploads.
  evidence: The route rejects `content-length` values above 6MB before parsing, but requests without reliable `content-length` still depend on the deployment platform/proxy to enforce aggregate body limits before `request.formData()` buffers multipart data.
- source_spec: `spec-2-7-stream-ai-ask-responses-and-accept-traveler-image-input.md`
  summary: Reduce per-request memory cost of base64-embedded image data URLs sent to the AI Gateway.
  evidence: A 5MB image becomes ~6.7MB base64, then a data-URL string, then is copied again by `JSON.stringify` of the full messages array. Under concurrent load this compounds memory pressure. A streaming base64 body or gateway multipart/binary image upload would avoid the multi-copy cost, but requires a gateway-protocol change that is out of scope for this story.
- source_spec: `spec-2-7-stream-ai-ask-responses-and-accept-traveler-image-input.md`
  summary: Harden SSE parser for multi-line `data:` events if a non-standard OpenAI-compatible gateway is adopted.
  evidence: `processStreamLine` in `src/features/ai/gateway.ts` parses each `data:` line as a complete JSON payload. The SSE spec allows multi-line `data:` fields concatenated with `\n`. OpenAI and most OpenAI-compatible gateways emit single-line events, so this is not reachable today; revisit if XuyenViet adopts a gateway/proxy that emits multi-line SSE data events.
