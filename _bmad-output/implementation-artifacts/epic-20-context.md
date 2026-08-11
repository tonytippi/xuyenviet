# Epic 20 Context: Discovery Control Tower

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Give authorized operators an action-first Discovery control tower that brings attention to stalled or risky Discovery work, explains how coverage needs connect to queries and candidates, shows safe automation health, and lets them pause or resume Discovery without changing Knowledge intake or manual capture. This keeps operator decisions focused and operationally safe rather than turning the surface into a KPI dashboard or a second Knowledge lifecycle.

## Stories

- Story 20.1: Build the Action-Required Discovery Queue
- Story 20.2: Deliver Knowledge Mission Drill-Downs
- Story 20.3: Deliver Automation Health and Safe Incident Detail
- Story 20.4: Control Discovery Enablement Safely
- Story 20.5: Verify Control Tower Accessibility and Operational Boundaries

## Requirements & Constraints

- Restrict every control-tower read and command to authorized operator/admin capabilities; the admin application remains a typed presentation client of protected API contracts.
- Open Discovery on a prioritized action-required queue, not a generic KPI dashboard or event stream. Show only reviewable candidates, aged high-priority review work, stalled high-priority Mission needs, persistent provider/rate-limit failures, and safe links to existing high-impact Knowledge recommendations. Keep routine successes and ordinary deferrals in Mission or Health.
- Let operators inspect distinct safe Mission read models for Coverage needs, Queries, Candidates, and the Discovery funnel. Coverage needs may be organized by corridor, location, route segment, taxonomy, and season, with safe freshness, conflict, and demand context.
- Let Mission drill from a high-priority need to linked query proposals, latest safe run context, and ranked candidates. Query controls support only simple create, text edit, priority change, pause, and resume; visibly distinguish system-generated proposals from operator-created proposals. Do not add advanced rule builders or blocking/exclusion policy.
- Health must show Discovery enabled state, last/next run, recent safe result, stage throughput, review backlog/deferred age, provider/rate-limit/schema incidents, and available usage telemetry. Clearly distinguish first-run, no-incident, stale, unavailable, retrying, terminal-failed, and rate-limited states; missing or stale telemetry must never appear healthy.
- Incident drill-downs may expose only safe candidate/run identity, stage, timestamp, retry or terminal state, and stable safe error category. Exclude raw comments, source material, prompts/responses, provider payloads, credentials, secrets, capture internals, evidence spans, and traveler data from all read models, errors, and feedback.
- The global Discovery switch changes immediately after a successful server command and has persistent text and accessible result feedback. It governs Discovery planning, YouTube search, enrichment, triage, and new candidate work only. It never changes queued Knowledge sources, capture state, or manual `youtube:capture`.
- When disabled, show an explicit paused explanation and no next run. In-progress runs must distinguish fencing requested, cancelled, and completed before cancellation. Guard repeated toggle commands until confirmation; re-enabling schedules only newly eligible work and never revives terminal cancelled runs.
- Preserve Vietnamese-first plain operational copy. Ranking context is not verification, factual evidence, publication approval, or capture completion. A link to a Knowledge recommendation must not imply Discovery can verify, publish, suppress, or otherwise change a Knowledge claim.
- Verify the full control tower at 320 CSS pixels and 400% zoom: all authorized functions remain available through sequential responsive views without two-dimensional scrolling, with keyboard operation, visible unobscured focus, selected-state semantics, non-color status cues, live announcements, and 44px mobile targets.

## Technical Decisions

- Discovery is a bounded URL-only module with PostgreSQL and Drizzle owning persistence, policy, leases, and audit; the Worker owns scheduled execution, while the admin API owns commands and safe read models.
- Compose existing Discovery policy, query, run, candidate, triage/usage, and review projections from Epics 18-19. The control tower adds no direct Knowledge writer, source link, capture scheduler, or Gemini video-analysis path.
- A single versioned PostgreSQL policy record owns global enablement, score/cadence/retention and bounded execution settings. Runs snapshot policy version and the Worker fences each provider call and Discovery write against current enablement under its lease.
- Use the existing closed state boundaries: recommendation (`skip | defer | consider`), candidate operator state (`pending | accepted | deferred | skipped`), and run state (`queued | running | retrying | completed | failed | cancelled`) stay separate. Terminal runs are not reopened.
- Discovery command mutations are audited with actor, target, action, timestamp, and bounded safe before/after summary. Automated execution uses `system-youtube-discovery`; Worker/API/admin ownership remains separate.
- Candidate actions hand off only through the existing Knowledge intake API. The control tower must preserve that intake and the manual `youtube:capture` workflow as independently owned systems.

## UX & Interaction Patterns

- Preserve the existing desktop-first admin visual language: a flat navigation rail, short flexible worklist, and focused inspector/detail region. On narrow screens, replace split panes with sequential list/detail views while retaining function.
- The default action queue is calm and sparse. Its completion state links operators to Mission and Health rather than inventing work or substituting summary cards.
- Keep status legible through text and icons as well as color. Use safe, direct Vietnamese labels such as `Cần xem`, `Để sau`, `Đang bật`, and `Đang tắt`; do not lead with raw state codes or diagnostics.
- Actions and navigation are explicit, not hover-only. Announce queue ranges, selection, action completion, and safe failures via polite live regions; preserve predictable focus after queue navigation or mutation.
- Use non-blocking feedback for control changes while retaining durable inline state. The global switch is immediate; destructive policy actions use explicit confirmation when introduced.

## Cross-Story Dependencies

- Story 20.1 depends on the candidate review projections from Epic 19, Discovery safe records from Epic 18, and the existing Knowledge recommendation surface.
- Story 20.2 depends on Epic 18 query proposals, safe upstream Mission signals, candidate appearances, and Epic 19 ranking projections.
- Story 20.3 depends on Epic 18 Worker run, lease, retry, and telemetry records plus Epic 19 triage usage events.
- Story 20.4 depends on the Epic 18 versioned policy and Worker revocation fence.
- Story 20.5 validates the integrated Epic 18-20 API, Worker, and UI boundaries, including candidate acceptance through existing Knowledge intake and the continuing separation of manual capture.
