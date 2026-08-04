# Story 15.6: Deliver Target-Shaped Operator Knowledge Views

Status: backlog

## Story

As an operator, I want clear Knowledge API responses and admin screens, so that I can diagnose ingestion and resolve work without conflating technical processing with fact workflow.

## Acceptance Criteria

1. Authorized `/v1/admin/knowledge/*` reads serialize separate technical job status/counters, candidate processing/disposition/reason, card lifecycle/classification/verification, and work type/status/resolution fields. Endpoint-specific allowlists may expose only already-authorized bounded operator evidence quote/span; they never expose raw capture content, provider output, checkpoints, fence values, credentials, or execution secrets.
2. `apps/admin` uses documented direct NestJS APIs and existing credential/CSRF/safe-error behavior, without database/domain lifecycle imports or BFF/server proxy.
3. Mixed-result jobs display technical status with safe aggregate/candidate outcomes and no rolled-up publication label; candidate decisions remain intelligible after later operator actions.

## Tasks / Subtasks

- [ ] Do not start until Stories 15.1-15.5 have completed target schema, lifecycle command, retrieval/sampling behavior, and target-only fixtures. (AC: 1-3)
- [ ] Inventory every existing `/v1/admin/knowledge/*` endpoint and each required job/candidate read. For each, specify the target response fields, strict contract parser, database safe projection, Nest serializer/controller, role/capability guard, and evidence quote/span allowlist or exclusion. (AC: 1)
- [ ] Update contracts, domain ports, database safe projections, Nest serializers/controllers, and exact-key parsers together for target representation. Add positive serializer allowlists and non-disclosure tests for every endpoint. (AC: 1)
- [ ] Replace legacy `stage`/overlapping state/recommendation fields in draft, approved, recommendations, intake, capture queue, coverage, sampling, and progress routes/components. Remove legacy models/labels rather than providing a response fallback. (AC: 1, 3)
- [ ] Preserve direct browser API calls (`credentials: "include"`), API-owned CSRF acquisition, safe errors, request IDs, and role/capability guards. (AC: 2)
- [ ] Prove browser admin components do not import database code, lifecycle commands, BFF routes, server actions, or proxies. (AC: 2)

## Dev Notes

- This story is blocked until Stories 15.1-15.5 are complete. Do not expose technical checkpoint/fence data merely because jobs/candidates become more visible.
- `apps/admin` is presentation-only. NestJS owns admission, authorization, validation, direct `/v1` transport, and safe errors. The API may synchronously execute authorized operator decisions but never claims jobs or performs ingestion/index loops.
- Current contract parsers use strict shape validation. Change database projection, contract, controller, parser, and UI in one atomic interface update; do not allow a legacy response fallback.
- The disclosure boundary is explicit: bounded evidence quote/span is operator-only and must be endpoint/role allowlisted; raw capture, provider payloads, checkpoints, fences, credentials, and secrets are always excluded.
- Preserve Vietnamese-first accessible UI and existing layout conventions. Keep raw source material operator-only even in operator screens unless the current authorized bounded view already permits it.

### Project Structure Notes

- API/contracts: `packages/contracts/src/index.ts`, `packages/domain/src/*knowledge*.ts`, `packages/database/src/admin-knowledge-*.ts`, `apps/api/src/admin/*`.
- UI: `apps/admin/app/knowledge/`; no imports from `packages/database` or lifecycle implementation.

### Verification

```bash
pnpm test:unit -- tests/contracts-browser-compatibility.test.ts
pnpm test:integration -- tests/admin-knowledge-coverage.test.ts
pnpm test:integration -- tests/admin-facebook-capture-contract.test.ts
pnpm test:integration -- tests/youtube-capture-review-admin.test.ts
pnpm typecheck
pnpm --filter @xuyenviet/admin typecheck
```

### References

- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Read Models and Direct API UI]
- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Architecture Alignment]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 15.6]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

- _bmad-output/implementation-artifacts/15-6-deliver-target-shaped-operator-knowledge-views.md
