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

## Deferred from: code review of spec-3-3-extract-chat-and-trip-context (2026-07-07)

- source_spec: `spec-3-3-extract-chat-and-trip-context.md`
  summary: Use grapheme-aware truncation in `sanitizeContextValue` instead of UTF-16 code-unit `.slice(0, 500)`.
  evidence: Follow-up code review (pass 2, 2026-07-07). `src/features/chat-trips/context-extraction.ts:241` slices by UTF-16 code unit, which can split a decomposed Vietnamese diacritic (NFD form) or an emoji mid-cluster, leaving a dangling combining mark as the last stored character. Vietnamese text is almost always NFC so this is rarely reachable; a grapheme-aware slice (`Intl.Segmenter` or a small surrogate-pair-aware helper) adds complexity for a narrow case. Revisit if user input with decomposed characters or emoji in context values becomes common.
- source_spec: `spec-3-6-delete-chat-sessions.md`
  summary: Add external object-storage cleanup before non-null `message_image_attachments.storage_key` is used in production.
  evidence: Story 3.6 deletes image attachment metadata through conversation cascades, but no object-storage deletion helper exists yet. Current stream inserts `storageKey: null`, so this is not reachable today; once non-null storage keys are introduced, chat deletion must delete or enqueue deletion of the referenced objects before losing the pointer.

## Future brainstorm: retrieval and tool-calling strategy

- source_spec: `epic-3-retrospective`
  summary: Revisit how XuyenViet should use large backend knowledge effectively before or during Epic 5 retrieval/provenance work.
  evidence: During the Epic 3 retrospective, Tony flagged that user context and backend knowledge must stay compact but sufficient. Current MVP direction remains server-controlled retrieval: store structured knowledge in PostgreSQL, retrieve approved relevant items server-side, assemble a bounded data-only source bundle, and persist provenance independently. Future brainstorm should compare this against model tool-calling for agentic workflows, including auth/role enforcement, raw-source privacy, approved-only retrieval, source-bundle size, ranking, cost, latency, and provenance observability.
- source_spec: `spec-4-5-batch-seed-source-url-intake.md`
  summary: Define cross-batch/global duplicate policy for canonical source URLs.
  evidence: Story 4.5 rejects duplicate canonical URLs within one submitted batch, but does not decide whether a canonical URL already submitted in another batch or single-source intake should be skipped, linked, or allowed as separate provenance.
- source_spec: `spec-4-5-batch-seed-source-url-intake.md`
  summary: Decide whether recent seed batches should be scoped by submitting operator or globally visible to all operators/admins.
  evidence: The Story 4.5 admin intake page shows recent seed batches to any authorized operator/admin. This matches the current admin-wide knowledge workflow, but per-operator privacy was not specified and may be needed if seed URLs become sensitive.
- source_spec: `spec-4-6-approve-knowledge-for-retrieval.md`
  summary: Decide whether approved knowledge cards need first-class `approvedByUserId` and `approvedAt` columns.
  evidence: Story 4.6 records approval provenance in the audit log only, which satisfies the current approval lifecycle gate. Future card-level admin UI or retrieval diagnostics may need approval actor/time without querying audit history.
