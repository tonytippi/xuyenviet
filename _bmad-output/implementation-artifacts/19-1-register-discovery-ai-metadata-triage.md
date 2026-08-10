---
story_id: 19-1
status: ready-for-dev
created: 2026-08-10
epic: 19
---

# Story 19.1: Register Discovery AI Metadata Triage

## Story

As an operator,
I want Discovery triage to use a governed AI model with accountable safe output,
so that candidate recommendations are explainable operational input rather than an untracked provider shortcut.

## Acceptance Criteria

1. **Given** Discovery metadata triage requires an AI Gateway model, **when** the model catalog and Usage contract are extended, **then** they include dedicated `youtube_discovery_triage` purpose, text-input and structured-extraction capability requirements, versioned prompt identity, and `system-youtube-discovery` execution attribution.
   - Gemini video-analysis credentials and `youtube:capture` remain outside Discovery triage.

2. **Given** a candidate bundle is sent to triage, **when** the AI Gateway request is assembled, **then** it includes only bounded safe video/channel metadata, query context, and sanitized derived signals.
   - Raw comments, raw source material, transcripts, media, prompts/responses, provider payloads, traveler data, and credentials are excluded.

3. **Given** a Discovery triage invocation records AI usage, **when** the Usage writer persists the event, **then** it records `youtube_discovery_triage` model purpose, prompt version, `system-youtube-discovery` executor, and the linked Discovery run.
   - Selected-model attempts retain selected model and pricing attribution; the sole no-model failure uses safe unavailable provider/model values with null model/pricing attribution. Any other missing or invalid attribution prevents a successful triage record.

4. **Given** model selection, provider invocation, or output validation fails, **when** Discovery processes the result, **then** it records safe Usage/audit/run failure metadata and no Knowledge state is created.
   - Invalid output cannot become a candidate recommendation.

5. **Given** successful and failed metadata-triage paths persist Discovery records, **when** persistence-level safety tests inspect the resulting triage, usage, and run rows, **then** they prove raw comments, prompts/responses, provider payloads, transcripts, media, credentials, cookies, raw source material, evidence spans, and traveler content cannot be stored.
    - Only the bounded safe operational schema and required triage attribution are retained.

6. **Given** triage receives a schema-valid Gateway response, **when** it creates a durable assessment, **then** the assessment contains only `relevanceScore`, `expectedValueScore`, `freshnessFitScore`, `commercialRiskScore`, `duplicateRiskScore` (each finite and within `0..1`), and a deduplicated bounded list of closed derived-signal codes already present in its safe input.
   - It has no `skip | defer | consider` decision, ranking explanation, free-text reason, candidate decision state, queue rank, or arbitrary JSON; Story 19.2 exclusively turns this assessment into an immutable recommendation.

7. **Given** a candidate/run/prompt triage invocation is retried, **when** a prior invocation has already persisted a successful assessment, **then** the stable `(candidate, run, promptVersion)` invocation key prevents another Gateway call and another successful assessment/Usage pair.
   - A failed attempt may be retried only under the existing claimed-run retry policy; every attempt has an explicit safe terminal triage status and defined Usage expectation.

8. **Given** candidate retention selects an expired Discovery candidate, **when** its Discovery graph is removed, **then** its triage records are deleted before the candidate and its generic AI Usage events remain independently retained under the existing Usage policy.
   - Retention never deletes an unrelated Usage event or any Knowledge record.

## Tasks / Subtasks

- [ ] Extend the governed model and usage vocabulary (AC: 1, 3)
  - [ ] Add `youtube_discovery_triage` to the shared `AiGatewayModelPurpose` vocabulary in `packages/database/src/schema.ts` and `packages/contracts/src/index.ts`; update the database check through one new sequential Drizzle migration after `0053_harden_discovery_metadata_constraints.sql` and its journal entry. Never edit applied migrations.
  - [ ] Require selection of an active default model with `textInput` and `extraction` capabilities through `selectActiveAiGatewayModel`; do not invent a separate model registry, credential, provider SDK, or environment variable.
  - [ ] Add one seed catalog record for the new purpose only if the existing seed contract requires every supported purpose to have a default. Its model is an AI Gateway text model, not Gemini capture configuration.
   - [ ] Extend `packages/database/src/usage-constants.ts` with `youtube_discovery_triage` and stable `youtube_discovery_triage_v1`; keep `writeAiUsageEvent` as the sole writer. Include the new purpose in `packages/database/src/index.ts` `validateCompleteModel` default-model rule and add catalog/admin regressions requiring text input plus extraction.
   - [ ] Require `executorSystem: "system-youtube-discovery"`, prompt version, provider/model, safe status, bounded usage metadata, and Discovery-run linkage. For selected-model attempts, require model ID and pricing snapshot. For `no_eligible_model`, write a failure Usage event with `provider: "unavailable"`, `model: "unavailable"`, null model ID/pricing, the stable prompt version, and safe `no_eligible_model` error code; this is the sole permitted missing-model attribution shape.
   - [ ] Add one Discovery-owned `youtube_discovery_triages` record per `(candidate, run, promptVersion)` invocation. It links candidate, appearance, claimed run, policy version, optional selected model, optional Usage event, prompt version, and closed status `succeeded | no_eligible_model | gateway_failed | invalid_output`; successful rows contain only five `0..1` finite scores and closed derived-signal codes. Failed rows contain no assessment values. Enforce unique/FK/check constraints and bounded array shapes at schema/migration level. Do not store raw request/response text, free-text reasons, decisions, or arbitrary JSON.

- [ ] Build an isolated, bounded triage input/output contract (AC: 2, 4, 5)
   - [ ] Add a versioned Discovery triage prompt and an explicit typed input builder beside the Discovery Worker feature. Its input may read only a new bounded Discovery-owned triage-bundle reader for the claimed run: candidate safe columns, that run's appearance/query/policy provenance, and active derived-signal enum/count/score values. Order bundles by appearance ordinal, process at most the configured small fixed batch, and never construct a bundle from another run.
  - [ ] Bound every string, list, score, and factor before constructing a request. Do not recover omitted values by querying Knowledge, chats, users, sources, capture versions, evidence, or raw provider records.
   - [ ] Add a Discovery-specific typed wrapper around the existing non-streaming Gateway completion seam. It must accept the outer Worker abort signal, select an extraction-capable Gateway model, use a Discovery-labelled bounded timeout no greater than the remaining execution deadline, and be injectable through the Worker execution binding for DB-free tests. Do not expose Gateway credentials through Discovery-specific configuration.
   - [ ] Treat all output as untrusted. Strictly parse only the exact assessment shape in AC 6; reject malformed JSON, unknown keys, non-finite/out-of-range scores, unknown signals, duplicates, oversized arrays, and free-text fields.
   - [ ] On no eligible model, Gateway failure, abort/timeout, malformed JSON, or schema failure, return only one of the closed safe status/error categories above. Persist the defined failure Usage/triage pair atomically when a valid claim exists; never log, audit, return, or persist raw prompt, response, headers, request URL, credentials, or provider error body.
  - [ ] This story must not persist `skip | defer | consider`, score explanations for operator display, candidate decision state, or queue rank. Story 19.2 owns deterministic recommendation and immutable recommendation persistence.

- [ ] Execute triage through the existing fenced Discovery run (AC: 2-4)
   - [ ] Extend `runYoutubeDiscoveryPoll` only after canonical candidate persistence and safe enrichment. Reuse the current five-minute lease, 240-second abortable external-work deadline, current policy/proposal checks, and cancellation/retry/terminal-audit behavior. Stop beginning triage calls when the remaining deadline cannot accommodate the bounded Discovery Gateway timeout; leave unstarted candidates for a retry without claiming completion.
   - [ ] Expose a public Discovery pre-call fence check that returns only `active | cancelled | contended`; recheck it immediately before each Gateway call. Reuse a transaction-local guarded writer for triage/Usage persistence that locks the run, current policy, and enabled proposal. `cancelled` commits only through the existing one-terminal-audit path; `contended` writes nothing; both discard in-memory Gateway output.
   - [ ] Persist the schema-valid triage record and its Usage event atomically under the valid claim. A write guard loss rolls back both. A succeeded invocation key is read before calling the Gateway and is treated as complete without a second provider call.
  - [ ] A triage failure must follow the existing bounded transient retry/terminal run policy and safe run error contract. It must not create a Knowledge source, capture version, ingestion job, evidence, card, recommendation, or operator action.
   - [ ] Extend Discovery retention only to delete triage rows before candidate deletion; preserve existing comment-signal, history, appearance, candidate, and generic Usage retention behavior. Keep `youtube:capture`, Gemini video analysis, search/enrichment endpoint behavior, and candidate canonicalization unchanged.

- [ ] Verify catalog, privacy, attribution, and fencing boundaries (AC: 1-5)
  - [ ] Add DB-free unit tests for model capability selection, versioned prompt/input construction, input bounds, strict output parsing, malformed/oversized/non-finite output rejection, Gateway failure normalization, and proof that request/persistence shapes contain no prohibited raw data or credentials.
   - [ ] Add serial PostgreSQL integration tests with local `resetTestDatabase()` setup for purpose/model constraints, required system executor attribution, run/model/prompt linkage, invocation-key idempotency, success and every safe failure status, no-model Usage shape, policy/proposal revocation and lease loss after Gateway return, atomic usage/triage rollback, exactly one terminal run audit, deadline-bounded partial work, and triage-before-candidate retention deletion.
   - [ ] Add source/schema boundary regressions rejecting direct Discovery imports/reads/writes of Knowledge tables and all raw comment/prompt/response/provider/transcript/media/cookie/source/evidence/traveler fields. The existing opaque `YoutubeCaptureEligibilityPort` remains the sole allowed Knowledge integration. Use synthetic bounded fixtures only.
  - [ ] Run focused `pnpm exec vitest run --project unit <files>` and `pnpm exec vitest run --project integration <files>`, then `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Record exact unavailable `DATABASE_URL_TEST` or unrelated baseline failures; do not weaken the unit/integration separation.

## Dev Notes

### Scope and sequence

- Epic 18 is complete. Reuse its canonical candidate graph, enrichment fields, sanitized signal rows, safe prior-capture port, Worker registration, system executor, run lease/fence, policy revocation, retry, and terminal audit contracts.
- This story establishes only governed metadata triage, safe triage provenance, and AI Usage attribution. Story 19.2 owns deterministic eligibility, immutable `skip | defer | consider` recommendation, score factors/penalties, and review admission. Stories 19.3-19.5 own API/UI, operator candidate state/actions, and Knowledge intake handoff.
- Discovery remains URL-only. It must not create, write, import, link, or query `sources`, capture versions, ingestion jobs, evidence, cards, source bundles, lifecycle/publication state, chat/traveler data, or Knowledge source IDs. `YoutubeCaptureEligibilityPort` remains the only Knowledge interaction.

### Existing implementation to preserve

- `packages/database/src/schema.ts` currently owns candidate safe metadata, comment signals, appearance provenance, and ranking-history stage `discovered | enriched | triaged`. Extend it minimally; a triage history stage alone is not a recommendation or mutable candidate decision.
- `packages/database/src/youtube-discovery/index.ts` owns run claims, `guardYoutubeDiscoveryCandidateWrite`, candidate/enrichment writes, policy revocation, retries, and terminal Audit. All Discovery durable writes must retain its active-lease/current-policy/current-proposal guard and rollback-on-guard-loss behavior.
- `packages/worker-domain/src/features/youtube-discovery/execution.ts` is the finite Worker poll. It persists candidates before enrichment, puts external work outside transactions, has an abortable 240-second boundary, and converts stage failures through `retryYoutubeDiscoveryRun`. Do not create a request-serving loop, scheduler, or new Worker capability.
- `packages/database/src/models.ts` selects a current active default AI Gateway model by purpose and capabilities. `packages/database/src/usage.ts` validates the system executor and normalizes usage/cost data; do not bypass it with direct `ai_usage_events` inserts.
- `packages/database/src/usage-constants.ts` is the shared Usage purpose/prompt-version vocabulary. `packages/database/src/index.ts` validates capability requirements when an administrator marks a catalog model as default; update both alongside shared contracts and database purpose checks.
- `apps/worker/src/adapters.ts` is the Worker configuration boundary. Do not add a Gemini credential or expose AI Gateway secrets to Discovery configuration. Use the existing Gateway boundary only.

### Security, privacy, and attribution guardrails

- Triage input is limited to bounded candidate fields: canonical video identity/URL, safe title/description/channel/public metadata, run query context, and derived signal enums/counts/scores. Popularity/channel metrics and triage scores are ranking input only, never proof of correctness, credibility, evidence, verification, publication eligibility, or capture permission.
- Never retain raw comments, prompt text, model response text, provider body/headers, transcripts, media, credentials, cookies, raw source material, evidence spans, source links, traveler identity/content, or arbitrary JSON. Audit truncation is not sanitization: omit unsafe material before constructing Audit or Usage inputs.
- Every invocation is attributed to `system-youtube-discovery`; it has no `initiatedByUserId`, conversation, trip, or message association. Missing/invalid system attribution or selected model data is a failure, not a successful triage record, except the defined `no_eligible_model` failure row has no selected model.
- The prompt version is a stable bounded constant. Provider/model usage metadata is safe operational attribution, not an authorization to schedule manual capture or mutate Knowledge.

### Database and migration rules

- Add exactly one forward Drizzle migration after `0053`; update `drizzle/migrations/meta/_journal.json`, schema exports, type vocabularies, and all database check constraints together. Do not modify previous migration files or introduce a compatibility/dual-write path.
- The current database has model-purpose checks in both `ai_gateway_models` and shared TypeScript/contracts. A migration must update the database constraint, not only TypeScript, or a valid triage model will fail at runtime.
- Any new triage table is Discovery-owned (`youtube_discovery_*`), has candidate/run/policy/model provenance, and contains only closed bounded fields. Do not add recommendation, candidate decision, review queue, API read-model, source, capture, or budget tables.
- Add the triage table to `retainYoutubeDiscoveryRecords` deletion order before `youtube_discovery_candidates`; generic `ai_usage_events` survive as independently retained safe cost/audit records. No FK may leave candidate retention blocked or delete unrelated Usage rows.

### Testing requirements

- Unit tests are infrastructure-free: no `DATABASE_URL`, `DATABASE_URL_TEST`, Drizzle migration, or PostgreSQL connection.
- Integration tests are serial and must call `resetTestDatabase()` in their own setup when clean state is required. Do not restore a global reset hook or enable parallel workers.
- Test behavior, not only calls: Gateway must not be called after revocation; an output returned before fence loss must not persist; failure must retain safe attribution/usage as required but never a recommendation; invalid output must not affect candidate reviewability or Knowledge state.
- Assert the exact row matrix: `no_eligible_model` writes the defined null-model Usage plus an empty failure triage; selected-model Gateway/parse failures retain selected attribution with an empty failure triage; only `succeeded` has five bounded scores and closed signals. A finished invocation must prevent duplicate Gateway calls, successful triages, and Usage events.
- Fixtures must be synthetic, bounded, and free of real comments, source text, credentials, provider payloads, traveler data, or copied video metadata.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 19 and Story 19.1]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-youtube-discovery-2026-08-06/ARCHITECTURE-SPINE.md#AD-1, AD-3, AD-5, AD-6, and AD-8]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-youtube-discovery-2026-08-06/EXPERIENCE.md#Trust, Privacy, And Provenance]
- [Source: docs/proposals/ai-first-youtube-discovery.md#AI Candidate Triage and Acceptance Invariants]
- [Source: _bmad-output/implementation-artifacts/18-5-enrich-candidates-with-safe-derived-signals-and-retention.md#Scope and sequence]
- [Source: packages/database/src/schema.ts#aiGatewayModelPurposeValues, youtubeDiscoveryCandidates, youtubeDiscoveryCommentSignals, youtubeDiscoveryRankingHistory, and aiUsageEvents]
- [Source: packages/database/src/models.ts#selectActiveAiGatewayModel]
- [Source: packages/database/src/usage.ts#writeAiUsageEvent]
- [Source: packages/database/src/usage-constants.ts#aiUsagePurposes and aiUsagePromptVersions]
- [Source: packages/database/src/youtube-discovery/index.ts#guardYoutubeDiscoveryCandidateWrite]
- [Source: packages/worker-domain/src/features/youtube-discovery/execution.ts#runYoutubeDiscoveryPoll]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Debug Log References

- BMad create-story context analysis and checklist validation completed 2026-08-10.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- The guide reconciles Story 19.1 acceptance criteria with the Discovery architecture/UX contracts, Epic 18 implementation, current schema/migration sequence, AI model/usage boundaries, Worker fence behavior, and project test rules.
- No implementation, migration, provider credential, external provider call, database reset, test execution, or commit was performed while creating this story.

### File List

- _bmad-output/implementation-artifacts/19-1-register-discovery-ai-metadata-triage.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
