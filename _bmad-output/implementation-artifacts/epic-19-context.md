# Epic 19 Context: Explainable Candidate Review And Knowledge Intake Handoff

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Enable authorized operators to review one ranked YouTube video URL at a time, understand a bounded, plain-language recommendation, and accept, defer, or skip it safely. Acceptance hands only the canonical URL to the existing Knowledge intake contract; it must never be confused with capture, evidence generation, publication, or traveler retrieval.

## Stories

- Story 19.1: Register Discovery AI Metadata Triage
- Story 19.2: Produce Deterministic Candidate Recommendations
- Story 19.3: Review One Ranked Candidate at a Time
- Story 19.4: Accept a Candidate Through Knowledge Intake
- Story 19.5: Defer, Skip, and Verify Candidate Decision Safety

## Requirements & Constraints

- Use a dedicated governed AI Gateway purpose, `youtube_discovery_triage`, with text-input and structured-extraction capability, a versioned prompt, linked Discovery run, safe Usage record, and `system-youtube-discovery` executor attribution. Gemini credentials and the manual `youtube:capture` workflow are outside Discovery triage.
- Send triage only bounded safe video/channel metadata, query context, and sanitized derived signals. Do not retain or expose raw comments, source material, transcripts, media, prompts or responses, provider payloads, credentials, cookies, evidence spans, or traveler content.
- Schema-valid triage persists only finite 0..1 relevance, expected-value, freshness-fit, commercial-risk, and duplicate-risk scores plus bounded deduplicated input-derived signal codes. It must not persist a recommendation, free-text reason, arbitrary JSON, or operator state.
- A stable candidate/run/prompt invocation key prevents duplicate successful Gateway calls, triage records, and Usage records on retry. Failed model selection, calls, or validation record only safe failure metadata and cannot produce a recommendation or Knowledge state.
- Deterministic policy, not model output, determines review eligibility and immutable `skip`, `defer`, or `consider` recommendations. Recheck canonical URL, public individual-video eligibility, deduplication, the Knowledge-owned prior-capture lookup, and configured score bands; any failed hard condition wins.
- Keep immutable recommendation separate from mutable operator state: `pending`, `accepted`, `deferred`, or `skipped`. Only authorized operators may make candidate decisions, and commands must be audited with safe summaries.
- Accept calls the existing Knowledge seed-batch intake API with the canonical URL. Mark the candidate accepted only after `submitted` or `duplicate`; do not write `sources`, retain a source ID/link, create an export aggregate, invoke Gemini, or invoke, schedule, enqueue, or retry `youtube:capture`.
- Submitted acceptance reports that the URL entered pending Knowledge sources and that manual YouTube Capture is still required. Duplicate acceptance has distinct feedback and must not infer capture state or instruct another capture. Unknown intake results reconcile before retry; confirmed failures retain the candidate in review with safe recovery feedback.
- Defer and skip transition only to `deferred` and `skipped`, respectively, remove the candidate from immediate review, and retain only policy-allowed safe history. Candidate, channel, and query blocking or exclusion policy is out of scope.
- After any decision, refetch active ranked candidates and select the first remaining eligible one; show a calm completion state if none remain. Verify authorization, stale/concurrent decisions, intake outcomes, reconciliation, and the boundary preventing Discovery-created Knowledge state beyond the existing intake API.

## Technical Decisions

- Discovery is a PostgreSQL and Drizzle-backed, URL-only module. Discovery-owned persistence, contracts, API transport, and admin client use the `youtube_discovery_*` naming boundary; server-side admin API commands own mutations and audited read models, while `apps/admin` remains a typed presentation client.
- A canonical candidate is unique by validated YouTube video ID. Discovery and Knowledge intake share the exported canonicalizer for documented HTTPS `youtube.com` and `youtu.be` individual-video URLs, yielding `https://www.youtube.com/watch?v=<video-id>`.
- Use the existing AI Gateway adapter and Usage boundary for metadata triage. Model output is untrusted, schema-validated operational input and cannot authorize capture or Knowledge lifecycle work.
- Discovery accesses prior-capture status only through the Knowledge-owned safe lookup, never by querying Knowledge tables or persisting Knowledge source links.
- Persist bounded metadata, sanitized derived comment signals, score factors, policy/version references, stable safe errors, and audit summaries only. Store timestamps in UTC; safe errors use stable codes and bounded summaries.
- Triage recommendation, candidate operator state, and Worker run state remain distinct closed enums. The existing Worker owns scheduled execution and run lifecycle; API/admin candidate decisions must not execute Discovery stages.
- Retention deletes triage rows before their candidate graph. Generic Usage events retain their independent policy.

## UX & Interaction Patterns

- Deliver a role-protected, desktop/tablet queue-plus-persistent-inspector workspace for one-at-a-time review. Queue data is paginated or explicit load-more; narrow and mobile layouts reflow to sequential queue/detail surfaces without horizontal two-dimensional scrolling or loss of authorized function.
- Candidate rows show scan-safe title, channel, published date/duration when available, plain-language recommendation, priority, and operator state. The inspector shows canonical URL, safe video/channel metadata, query reason, recommendation, up to five applicable factors or penalties, derived signals, prior safe capture outcome, and explicit `Accept`, `Để sau`, and `Bỏ qua` actions.
- Recommendations and signals are ranking context only, never verified facts, evidence, credibility proof, or publication approval. Numeric scores are authorized progressive disclosure, not the primary explanation.
- Accept is immediate with no confirmation dialog. While it is pending or reconciling, disable all inspector actions, retain context, and announce status through a polite live region. Submitted and duplicate results remove the row, advance focus and selection, and use distinct Vietnamese feedback; failure leaves it selected with retry.
- Queue selection, pagination, inspector updates, decisions, focus movement, and completion states must be keyboard accessible, visibly focused, labelled for assistive technology, and announced concisely. Use text and icon with color-independent status treatment; keep touch targets at least 44px where supported.
- Keep the existing practical admin visual language: a workbench rather than a KPI dashboard, borders and tonal selection before shadows, non-blocking toasts that do not steal focus, and plain Vietnamese operational copy without raw diagnostics.

## Cross-Story Dependencies

- Epic 18 supplies the Discovery policy, candidate/run/query persistence, canonicalizer, safe prior-capture lookup, Worker and audit/Usage foundations, and bounded safe enrichment data consumed by this epic.
- Story 19.1 must provide validated, attributed triage assessments before Story 19.2 derives immutable deterministic recommendations.
- Stories 19.1 and 19.2 provide the safe ranking and explanation projections used by Story 19.3.
- Story 19.4 depends on the existing Knowledge seed-batch intake API and its `submitted`, `duplicate`, failed, and reconciling outcome contract.
- Story 19.5 validates all decision commands and queue recovery behavior. Epic 20 later composes these review capabilities into the broader action queue, Mission, and Health control tower.
