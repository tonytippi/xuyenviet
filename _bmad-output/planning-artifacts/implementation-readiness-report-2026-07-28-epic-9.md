---
status: superseded
scope: Epic 9 Trusted Private API Foundation
date: 2026-07-28
sources:
  - prds/prd-xuyenviet-2026-07-04/prd.md
  - architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md
  - epics.md
  - ../implementation-artifacts/9-1-establish-bff-credentials-and-api-request-principals.md
  - ../implementation-artifacts/9-2-govern-initial-administration-and-role-changes.md
  - ../implementation-artifacts/9-3-enforce-the-private-bff-transport-boundary.md
  - ../implementation-artifacts/9-4-publish-versioned-api-contracts-and-migrate-a-protected-read.md
---

# Epic 9 Implementation Readiness Report

> **Historical readiness evidence only.** The Epic 9 BFF/private-bearer transport assessed here was superseded for active planning on 2026-08-03 by the direct NestJS browser-session architecture. Preserve this report as evidence for completed foundation work; use the current PRD, Architecture Spine, Epic 14, and active story/spec artifacts for implementation decisions.

## Scope And Authority

This was the readiness assessment for Epic 9 only. The PRD is the product source of truth; the Architecture Spine is the implementation-invariant source of truth. Its four Epic 9 story guides remain completed historical records, not the active delivery plan.

This report replaces the superseded 2026-07-10 Facebook-capture readiness assessment. Historical readiness reports remain historical evidence only and must not override current PRD, architecture, epics, or active story guides.

## Requirement Coverage

Epic 9 covers the private API foundation for FR-51, FR-52, FR-54, FR-55, and FR-56, plus NFR-14 and NFR-15.

| Story | Deliverable | Architecture contract |
| --- | --- | --- |
| 9.1 | Root-web BFF credential minting, Nest request-principal guard, host-only database-session-token resolution, issuer isolation, and safe-error DTO | AD-1, AD-4, AD-37 |
| 9.2 | One-shot first-admin bootstrap and authorized role governance with audit/version freshness | AD-4, AD-6, AD-31 |
| 9.3 | BFF transport client, private bearer-only API boundary, CSRF policy, correlation and safe-error projection | AD-4, AD-37 |
| 9.4 | Health/version/OpenAPI, schema-admission readiness, extracted conversation-summary read, and controlled BFF/API cutover | AD-1, AD-15, AD-32, AD-33, AD-37 |

The separate deployed admin BFF is intentionally outside Epic 9 and remains Epic 13 work. Epic 9 establishes admin issuer/verifier isolation without sharing the root-web Auth.js cookie or claiming live admin-host credential minting.

## Resolved Review Findings

- The BFF resolves the exact host-specific Auth.js database session token server-side before minting `sid`; Nest never parses browser cookies or Auth.js serialization.
- JWT `jti` is cryptographically random token identity, not a replay ledger. Session existence and authorization-version matching provide effective credential revocation.
- First-admin bootstrap uses the cataloged `system-admin-bootstrap` execution actor and a capability-scoped deployment context; it does not fabricate an admin principal. The target must be a real user with a linked Auth.js account.
- Application and repository role grant paths outside Auth/Admin are prohibited. Migration/DBA credentials are an isolated, auditable deployment control plane rather than an impossible-to-prevent database threat.
- The safe API error envelope is owned by Story 9.1's shared contracts foundation and is reused by the Story 9.3 global transport boundary.
- Unsafe cookie-authenticated BFF routes use exact origin validation, Fetch Metadata when supplied, and signed double-submit CSRF cookie/header validation before any credential mint or API call.
- API readiness has a defined owner: Story 9.4 creates the `release_schema_versions` record, migration advisory lock, checked-in workload compatibility declaration, and admission tests required by AD-33.
- The protected conversation-summary read has a bounded unpaginated contract, ISO-8601 UTC timestamps, deterministic ordering, an extracted domain/database seam, and a fail-closed `XV_CONVERSATION_SUMMARY_API_ENABLED` routing switch.

## Sequencing And Admission

1. Story 9.1 is ready to start.
2. Story 9.2 may start after Story 9.1 verifies principal staleness after an authorization-version change.
3. Story 9.3 may start after Story 9.1 completes its identity integration coverage.
4. Story 9.4 may start after Stories 9.1 through 9.3 complete and their identity/transport integration coverage passes.

Each story must retain its current scope boundaries. Story 9.3's protected transport test handler is verification infrastructure, not a second production capability. Story 9.4 is the first real API/BFF capability cutover and must prove only one selected transport owner executes.

## Readiness Verdict

**READY WITH ORDERED DEPENDENCIES.**

The Epic 9 architecture and story contracts are now internally aligned and sufficiently specific for implementation. This verdict covers documentation readiness only; each story remains subject to its specified database-backed integration, lint, typecheck, build, API/workspace build, and migration/admission verification before completion.

## Remaining Work Outside This Epic

- Epic 10 owns AI Ask API streaming, idempotency, terminal fences, outbox, and legacy stream retirement.
- Epic 12 owns dedicated worker runtime operations beyond Epic 9's API schema-admission foundation.
- Epic 13 owns the separately deployed admin BFF and operational capability migration.
- Epic 14 owns the complete inventory and retirement of remaining legacy transport owners before public launch.
