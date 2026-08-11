# Epic 20 Context: Discovery Control Tower

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Give authorized operators one focused Discovery control tower for the small set of items requiring attention: actionable review work, Mission gaps, persistent automation issues, and Discovery enablement. Operators must be able to trace a knowledge need through queries and candidates, understand safe operational health, and pause or resume Discovery without turning the surface into a generic analytics dashboard or altering the separate Knowledge capture and publication lifecycle.

## Stories

- Story 20.1: Build the Action-Required Discovery Queue
- Story 20.2: Deliver Knowledge Mission Drill-Downs
- Story 20.3: Deliver Automation Health and Safe Incident Detail
- Story 20.4: Control Discovery Enablement Safely
- Story 20.5: Verify Control Tower Accessibility and Operational Boundaries

## Requirements & Constraints

The default Discovery entry must be an action-required worklist, not a KPI card wall, event feed, or ordinary history view. It includes only reviewable candidates, aged high-priority review work, stalled high-priority Mission needs, persistent Discovery failures or rate limits, and links to high-impact Knowledge recommendations. Normal deferrals and routine successful runs belong in Mission or Health. Empty and paginated states need calm, accessible result messaging and predictable focus.

Mission must provide distinct, safe Coverage needs, Queries, Candidates, and Discovery funnel views. Operators need to trace a high-priority coverage or freshness need through linked system- or operator-origin queries, latest safe run context, and ranked candidates. Coverage context can identify corridor, location, route segment, taxonomy, seasonal need, and safe freshness, conflict, or aggregate-demand context. Query management remains limited to simple create, text edit, priority change, pause, and resume; advanced rule builders and candidate/channel/query blocking or exclusion policy are out of scope.

Health must make enablement, last and next run, recent safe result, stage throughput, review backlog/deferred age, incidents, and available usage telemetry legible. It must distinguish retrying, terminal failure, rate limiting, no run yet, no incident, stale data, and unavailable projections. Missing or stale telemetry must never be represented as healthy. Safe incident drill-down is limited to candidate/run identity, stage, timestamp, retry or terminal status, next-attempt context where available, and stable safe error category.

The global enablement control changes Discovery planning, search, enrichment, and triage only. It must not change queued Knowledge sources, invoke, schedule, cancel, or retry manual `youtube:capture`, or imply a Knowledge claim changed. Disabling fences in-flight Discovery work at its Worker boundaries; the UI distinguishes fencing requested, cancelled, and completed before cancellation. Re-enabling schedules only newly eligible planning/query work and never revives terminal cancelled runs. Prevent repeated switch commands until the preceding server result is confirmed.

All surfaces and commands require current authorized operator roles and return only safe errors and identifiers. Discovery stays URL-only: it must not directly create Knowledge sources, capture versions, ingestion jobs, evidence, cards, publication state, or Knowledge-claim decisions. A route to a high-impact Knowledge recommendation must open the existing Knowledge surface, where Knowledge retains verification, publication, suppression, and conflict authority.

Never persist or display raw comments, source material, evidence spans, traveler data, prompts, model responses, provider payloads or diagnostics, transcripts, media, credentials, cookies, secrets, or capture internals. Candidate signals and triage factors are ranking context only, never verified facts, evidence, or publication approval. Vietnamese-first operator copy must state outcomes accurately, especially that an accepted URL entering Knowledge intake does not mean capture, Gemini analysis, evidence creation, card activation, or traveler retrieval.

## Technical Decisions

Discovery is a PostgreSQL-backed, modular operational workflow. Discovery owns its policy, query, candidate, run, audit, and safe read-model records through Drizzle migrations; normal control-tower reads use projections. `apps/admin` is a typed presentation client, while role-protected admin API commands own mutations. The Worker, not request-serving API code, owns due-run execution, provider calls, retries, and run transitions.

Use the established Discovery policy as one versioned PostgreSQL record for global enablement, scoring, cadence, retention, and bounded concurrency/retry configuration. Runs snapshot the effective policy version. Worker work is protected by PostgreSQL leases and fencing; it rechecks current enablement and the captured policy at every provider-call and Discovery-write boundary. Run state remains the closed lifecycle `queued`, `running`, `retrying`, `completed`, `failed`, or `cancelled`; terminal states are never reopened. Automated execution uses the registered `system-youtube-discovery` executor and retains safe audit attribution.

Preserve the separate closed meanings of triage recommendation (`skip`, `defer`, `consider`), mutable candidate operator state (`pending`, `accepted`, `deferred`, `skipped`), and run state. Candidate identity is the canonical YouTube video ID and safe canonical URL; query/run appearances and ranking history remain linked without duplicate review work. Query projections must preserve `system` versus `operator` origin, reason, priority, text, enabled/paused state, cadence, and next-run context.

The control tower composes safe projections and existing protected commands from prior Discovery work. It does not become a second writer for Knowledge or a capture scheduler. Discovery acceptance calls the existing Knowledge seed-batch intake API with the canonical URL, but that handoff and its submitted/duplicate/failure reconciliation behavior remain owned by the existing candidate-review command. Use safe, bounded error summaries rather than provider error text, and keep safe operational metadata retention policy-controlled.

## UX & Interaction Patterns

Use the existing desktop-first admin workbench style: a flat navigation rail, flexible main queue/list, and optional focused detail pane. The action queue is short and ordered. Mission and Health use readable lists or tables with focused detail, not dense chart walls or infinite scroll. At narrow widths, collapse split panes into sequential list/detail pages or sheets while retaining every authorized function and avoiding two-dimensional scrolling.

Action items must have a clear type, concise reason, priority/date context, and one destination action. Queue selection opens the appropriate candidate workspace, Mission detail, Health incident, or existing Knowledge recommendation surface. Global status uses persistent Vietnamese text such as `Đang bật` and `Đang tắt`, plus `aria-live` completion updates; color is never the only status cue. Health also uses direct, safe labels for retrying, failure, and rate limiting rather than raw technical codes.

Meet WCAG 2.2 AA across desktop, narrow, and mobile presentations, including 320 CSS-pixel width and 400% zoom. Support keyboard-only operation, visible non-obscured focus, selected-state semantics, screen-reader queue context, polite live announcements, programmatic validation errors, and at least 44px mobile touch targets. Page or load-more changes retain predictable focus and announce the result range; an empty action queue moves focus to a completion state with Mission and Health paths.

## Cross-Story Dependencies

Epic 20 depends on Epic 18's Discovery policy, query proposals, canonical candidate history, Worker run/lease/fence state, safe telemetry, and read-model foundation. It depends on Epic 19's ranked review projections, protected candidate decisions, and existing Knowledge intake handoff. Story 20.1 composes those projections and routes to existing surfaces; Story 20.2 needs the query and candidate history; Story 20.3 needs run, telemetry, and usage records; Story 20.4 depends on the policy command and Worker revocation fence; Story 20.5 verifies these end-to-end boundaries across Epics 18-20.

Knowledge remains the exclusive owner of source creation, capture, ingestion, evidence, verification, publication, suppression, and conflict decisions. The manual `youtube:capture` workflow remains separately operator initiated. Existing Knowledge recommendation surfaces remain the destination for high-impact verification or conflict work.
