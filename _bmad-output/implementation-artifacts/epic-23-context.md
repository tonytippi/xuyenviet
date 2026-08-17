# Epic 23 Context: Operator-Guided Proactive Knowledge Discovery

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Enable authorized operators to proactively improve the Vietnamese road-trip Knowledge corpus without creating autonomous publishing or capture behavior. Operators need a trustworthy, bounded view of Knowledge coverage under current Vietnamese province/city units while retaining legacy place names; they can request AI-generated Vietnamese search queries from aggregate signals, choose or author a query, run it immediately, follow safe progress, and continue through the established candidate-review and Knowledge-intake flow. This closes the gap between observing coverage and acting on it while preserving Knowledge and Discovery ownership boundaries.

## Stories

- Story 23.1: Normalize Current And Legacy Province References
- Story 23.2: Show Province Coverage And Propose Vietnamese Queries
- Story 23.3: Run Confirmed Queries Immediately And Show Progress

## Requirements & Constraints

- Use a small official, versioned province/city reference that gives each current unit a stable identity, display name, effective version/date, and deterministic mappings from unambiguous legacy province-level names. Keep the original source label available. Ambiguous, overly granular, or unmappable labels remain unresolved; do not infer geography with AI or imply nationwide applicability.
- Coverage groups Knowledge under the resolved current unit while current and legacy names remain searchable. Show only bounded counts by topic, freshness, related legacy names, and latest update. Counts provide operator context, never an automatic sufficient/insufficient coverage verdict.
- AI suggestions are available only after an operator selects a bounded geography. Requests may contain canonical geography plus aggregate topic/count/freshness and safe aggregated demand; they must exclude raw Knowledge text, source material, evidence, traveler identity or content, prompts, conversations, answers, and provider payloads.
- A valid suggestion presents current geography, a concise knowledge need and reason, and a natural Vietnamese YouTube query. The operator can edit, dismiss, run it now, or create a query directly. Suggestions never start Discovery without explicit operator confirmation.
- An enabled confirmed or operator-authored query may bypass scheduled `nextRunAt` through idempotent immediate-run admission. It must use the established Worker execution path and report only safe run status, bounded timing/counts, candidate-processing progress, and safe retry/error context.
- `Xem video` opens the existing Vietnamese-first candidate review flow. Discovery remains URL-only: it never creates Knowledge records, capture versions, ingestion jobs, evidence, cards, or publication state; it must not start, schedule, or retry manual `youtube:capture`.
- All surfaces and commands are role-protected and auditable. Retain and display bounded safe operational information only; never expose raw provider diagnostics, prompts/responses, payloads, source material, evidence spans, secrets, or traveler content.

## Technical Decisions

- Keep the change inside the existing modular monolith: Knowledge owns the current/legacy geography reference and bounded coverage summary; Discovery owns query suggestions, query/run admission, Worker execution, candidate processing, and safe projections. Use existing PostgreSQL/Drizzle, NestJS API, Worker, AI Gateway, and admin-client boundaries; add neither a new service nor GIS subsystem.
- Reuse shipped Discovery query proposal, run, candidate-job, review, and Knowledge-intake contracts. Immediate runs follow the same claim, PostgreSQL lease, fencing, policy-version snapshot, provider search, candidate-job, retry, and terminal-state path as scheduled work.
- Discovery global enablement and per-query enablement both govern admission/execution. Global disable is checked at each external-call and Discovery-write boundary, cancelling revoked Discovery work without changing queued Knowledge sources or manual capture. Query pause and global disable remain distinct states.
- Preserve separate closed state models for query/run execution, candidate processing, triage recommendation, and operator review. Terminal runs are not reopened; re-enabling Discovery schedules new eligible work rather than reviving cancelled runs.
- Use official-source-backed fixtures for province aliases and deterministic normalization. The scope is limited to province/city and topic coverage; route segments, seasons, automatic sufficiency thresholds, autonomous coverage-need lifecycle, raw-Knowledge AI scans, automatic capture, and publication paths remain out of scope.
- Discovery automated work retains `system-youtube-discovery` execution attribution. Operator commands preserve the real operator as command actor. Model calls use the existing governed AI Gateway boundary and record only permitted usage/audit information.
- Validate via focused unit tests for deterministic reference/alias and admission behavior, serial PostgreSQL integration tests for persistence, authorization and Worker fencing/idempotency, plus protected API/admin UI/accessibility checks. Integration tests that need clean tables reset their own database state.

## UX & Interaction Patterns

- Place the flow in the role-protected, desktop-first Knowledge Mission within the existing Discovery control tower. Keep the operator workbench style: readable coverage table/list, direct Vietnamese operational copy, and no KPI-dashboard substitution. On narrow layouts, preserve every authorized function in sequential list/detail views without two-dimensional scrolling.
- The coverage view shows current province/city, legacy references, topic counts, freshness, and latest update. The suggestion flow requires explicit bounded-scope selection and renders distinct `Chạy ngay`, `Sửa`, and `Bỏ qua` actions; never rely on color or hover-only controls.
- After immediate admission, query detail communicates `Đang chờ`, `Đang chạy`, `Hoàn tất`, `Thất bại`, or `Đã hủy` with safe timing, candidate count, processing progress, recovery context, and `Xem video` only when reviewable candidates exist. Preserve drafts and show accurate recovery when validation, disabled Discovery, conflicts, or execution fail.
- Use visible focus, keyboard operation, text plus color-independent status, polite live announcements for changing progress/actions, and 44px touch targets where applicable. Keep status and error copy plain-language Vietnamese rather than raw state codes or technical diagnostics.

## Cross-Story Dependencies

- Story 23.1 establishes the official current/legacy geography reference and deterministic normalization that Story 23.2 needs for coverage grouping and search.
- Story 23.2 supplies the operator-guided bounded suggestions and query choices that Story 23.3 admits for immediate execution and projects as progress.
- All stories extend the shipped Discovery and Knowledge intake pipeline rather than reopening it. Candidate confirmation and URL handoff use the existing review/intake flow; manual capture and every Knowledge lifecycle/publication decision remain external to this epic.
- Deliver Stories 23.1 through 23.3 sequentially before resuming Epic 21.
