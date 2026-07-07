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
- source_spec: `spec-3-1-manage-chat-sessions.md`
  summary: Optimize `listOwnedConversations` query and add a result cap/pagination for users with many conversations.
  evidence: The current `leftJoin` on `messages` (role='user') with JS dedup is owner-scoped and correct but loads N conversations x M user-messages rows; a naive `.limit()` would under-return conversations because the limit applies to joined rows. A `DISTINCT ON (conversations.id)` or batched 2-query approach plus a cap (e.g. 50) with a later "load more" UX is needed before volume grows.
- source_spec: `spec-3-1-manage-chat-sessions.md`
  summary: Deduplicate `previewMaxLength` and `formatPreview` logic across server and client.
  evidence: `src/features/chat-trips/conversations.ts` and `src/features/ai/ai-ask-composer.tsx` each define a 60-char truncation + "…" rule. If they drift, optimistic sidebar previews won't match server previews after reload. Extract a shared non-server-only module and import from both.
- source_spec: `spec-3-1-manage-chat-sessions.md`
  summary: Add a test for the `desc(conversations.id)` ordering tiebreaker in `tests/ai-ask-sessions.test.ts`.
  evidence: The existing test verifies `updatedAt` desc ordering but does not lock the secondary `desc(conversations.id)` tiebreaker when two conversations share the same `updatedAt`.
- source_spec: `spec-3-1-manage-chat-sessions.md`
  summary: Add a full focus-trap (tab cycling) to the mobile session sheet.
  evidence: The sheet now closes on Escape, focuses the panel on open, and restores focus to the trigger, but Tab focus can still escape behind the modal overlay to page content. A full tab-cycling trap (or a Headless UI/Radix Dialog) is needed for complete modal a11y.
- source_spec: `spec-3-2-create-trip-projects.md`
  summary: Allow re-associating an orphaned conversation with a trip project after its project is deleted.
  evidence: Follow-up code review (pass 2, 2026-07-07). `src/app/api/ai-ask/stream/route.ts:149-155` rejects any `conversationId + tripProjectId` pairing that does not match the stored `conversation.tripProjectId`. After `ON DELETE SET NULL` nulls `trip_project_id`, the conversation can be continued as ordinary chat but has no UI/path to attach to a new project. Deferred to Story 3.7 (delete trip projects) or a future project-edit story.
- source_spec: `spec-3-2-create-trip-projects.md`
  summary: Enforce `tripProjects.updatedAt` (and `conversations.updatedAt`) refresh on update via a DB trigger or shared helper.
  evidence: Follow-up code review (pass 2, 2026-07-07). `src/db/schema.ts:181` uses `defaultNow()` which only fires on INSERT. No update operation exists in Story 3.2, but a future update story that forgets `.set({ updatedAt: new Date() })` will leave stale timestamps. `conversations.updatedAt` is already manually maintained in the stream route.
- source_spec: `spec-3-2-create-trip-projects.md`
  summary: Handle the TOCTOU race where a linked conversation's project is deleted between the two reads in `src/app/ai-ask/page.tsx`.
  evidence: Follow-up code review (pass 2, 2026-07-07). `page.tsx:52-62` reads the conversation (gets `tripProjectId`), then calls `getOwnedTripProjectSummary(tripProjectId)` which may return null if the project was deleted concurrently. The conversation then renders with no project scope, is excluded from the ordinary session list (filter `isNull(tripProjectId)` misses the stale non-null value), and continuing it hits the "Project-scoped conversation requires its trip project scope" stream error. Narrow race; revisit when Story 3.7 implements project deletion.
- source_spec: `spec-3-2-create-trip-projects.md`
  summary: Translate pre-existing English error messages in the AI Ask stream route to Vietnamese.
  evidence: Follow-up code review (pass 2, 2026-07-07). `src/app/api/ai-ask/stream/route.ts:25` ("Authentication required.") and `:48` ("AI Ask question must be between 1 and 2000 characters.") pre-date Story 3.2 and surface to the user via `payload?.error`, conflicting with the Vietnamese-first UX rule. The 3.2-introduced project-ownership error is tracked as a patch in this review; the pre-existing ones are deferred to a separate cleanup.
