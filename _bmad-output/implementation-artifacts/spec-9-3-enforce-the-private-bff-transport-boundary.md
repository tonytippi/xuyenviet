---
title: 'Enforce the private BFF transport boundary'
type: 'feature'
created: '2026-07-28'
status: 'done'
baseline_revision: 'ac7ce47c6002486fd1949faf6f4ec0dab723e4fe'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-9-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Story 9.1 provides private bearer credentials and normalized principals, but there is no enforced BFF-to-API transport policy. Unsafe browser requests need CSRF protection before credential minting, and API failures need one correlated, safe, globally applied contract.

**Approach:** Add server-only BFF transport primitives and a protected test adapter, then wire Nest correlation, validation, safe exceptions, and bearer-only controller proof. Keep all real capability ownership and health/version endpoints for Story 9.4.

## Boundaries & Constraints

**Always:** Reuse `mintWebBffCredential`, `ResourceServerGuard`, `RequestPrincipal`, and the existing safe envelope; validate CSRF before minting or invoking API; target only a validated private API URL; keep credentials, cookies, session serialization, FormData, tokens, and private configuration out of browser/API payloads; preserve correlation, abort/timeout, and declared idempotency keys; return only safe Vietnamese presentation errors.

**Block If:** The required private API URL, BFF origin, or CSRF signing configuration cannot be validated without introducing a deployable insecure default; a required global Nest behavior cannot coexist with the current Story 9.1 guard contract.

**Never:** Do not migrate a production capability, implement health/version endpoints, configure CORS, add an API SDK, duplicate JWT/session parsing, import Next/Auth.js into `apps/api`, or modify the supplied story or sprint statuses.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Protected BFF adapter | Valid exact-origin request, signed matching CSRF token, declared idempotency key | Validated DTO, correlation ID, and unchanged declared key reach private API with server-side bearer | Browser response contains only projected safe result/error |
| CSRF rejection | Missing/mismatched/expired/signature-invalid token, foreign origin, or disallowed fetch site | Credential mint and API invocation do not occur | Stable safe CSRF response |
| Direct private API request | No bearer, malformed bearer, or only browser cookies | Controller is not executed and no CORS allow-origin header is emitted | Stable unauthorized envelope with request ID |
| API failure | Validation, authorization, or unexpected exception | API and BFF retain/generate one request ID and expose code/message/allowed violations only | No stack, SQL, cookie, token, or raw API body disclosure |

</intent-contract>

## Code Map

- `src/server/bff-credentials.ts` -- sole existing web credential minting boundary.
- `src/server/bff-api-client.ts` and `src/server/csrf.ts` -- new server-only BFF transport and unsafe-request policy.
- `packages/contracts/src/index.ts` -- existing principal/error DTOs to extend with runtime-safe parsing and stable codes.
- `packages/config/src/index.ts` -- validated private transport configuration.
- `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/auth/resource-server.guard.ts`, `apps/api/src/safe-api-exception.filter.ts` -- Nest transport bootstrap, protected principal boundary, and safe API envelope.
- `tests/api-request-principal.integration.test.ts`, `tests/safe-api-exception.filter.test.ts`, and new focused transport tests -- established Nest/PostgreSQL and BFF containment test patterns.

## Tasks & Acceptance

**Execution:**
- [x] `packages/contracts/src/index.ts` -- add stable safe error code/violation validation and safe-envelope parsing/presentation types -- BFFs reject untrusted API JSON and expose a bounded contract.
- [x] `packages/config/src/index.ts` -- validate private API URL, exact BFF origin, CSRF signing secret/lifetime, and bounded request timeout without insecure defaults -- BFF transport cannot silently target public or unconfigured endpoints.
- [x] `src/server/correlation-id.ts`, `src/server/csrf.ts`, `src/server/bff-api-client.ts` -- implement server-only correlation, signed double-submit CSRF issuance/validation, and thin credentialed fetch -- establishes reusable BFF behavior before any capability migration.
- [x] `apps/api/src/common/*`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/auth/*`, `apps/api/src/safe-api-exception.filter.ts` -- establish one request ID, global validation/filter behavior, and principal-only protected-controller support without CORS -- enforces the private API boundary.
- [x] `tests/*transport*.test.ts`, `tests/api-request-principal.integration.test.ts`, `tests/safe-api-exception.filter.test.ts` -- add BFF/API integration proof for CSRF ordering, DTO projection, correlation, cancellation, declared idempotency, direct-browser denial/no CORS, normalized principal, and safe redaction -- demonstrates every transport invariant without a real capability cutover.

**Acceptance Criteria:**
- Given an accepted cookie-authenticated protected BFF mutation adapter, when it calls the private API, then it validates CSRF and input before minting, forwards only validated DTO/operational metadata/internal bearer, and projects only the safe envelope.
- Given a direct browser-originated private API request lacking a valid bearer, when it supplies no bearer, malformed bearer, or only cookies, then it cannot execute protected capability logic and receives no `Access-Control-Allow-Origin` response.
- Given protected, validation, authorization, and unexpected API failures, when contract checks run, then controllers receive only `RequestPrincipal` plus validated DTO and responses contain stable safe fields with no sensitive diagnostic material.

## Spec Change Log

## Review Triage Log

### 2026-07-28 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 3 (high 1, medium 1, low 1)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high]` `[patch]` Registered `ResourceServerGuard` as the API-wide guard, so a newly added controller cannot omit bearer enforcement by accident.
  - `[medium]` `[patch]` Made validation-violation filtering tolerate malformed runtime array values and retain the safe 400 envelope.
  - `[low]` `[patch]` Restricts returned field violations to `validation_error` envelopes.

## Design Notes

The protected adapter is test infrastructure only. It declares whether it permits `Idempotency-Key`; the generic BFF client must not forward that header unless explicitly requested. Nest's request ID is canonicalized once per request and used by guard, validation, exception filter, and response. CSRF comparison validates signed/expiring token material and uses constant-time equality after bounded parsing.

## Verification

**Commands:**
- `pnpm exec vitest run tests/api-request-principal.integration.test.ts tests/safe-api-exception.filter.test.ts tests/bff-credentials.test.ts tests/bff-session-route.test.ts tests/*transport*.test.ts` -- expected: focused identity and transport proofs pass.
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: strict typecheck passes.
- `pnpm build` -- expected: production build succeeds.

## Auto Run Result

### Summary

Implemented the private BFF transport foundation without migrating a production capability. The web-side adapter validates the approved CSRF policy and DTO before minting a Story 9.1 credential; the API enforces bearer authentication globally, normalizes request IDs, validates declared DTOs, and emits bounded Vietnamese-safe errors without CORS configuration.

### Files Changed

- `packages/contracts/src/index.ts` - stable safe-error codes and runtime envelope parsing.
- `packages/config/src/index.ts` - fail-closed private transport configuration validation.
- `src/server/bff-api-client.ts` - server-only private API client with correlation, abort/timeout, and safe projection.
- `src/server/correlation-id.ts` - canonical BFF request-ID generation.
- `src/server/csrf.ts` - signed double-submit CSRF token issuance and validation.
- `src/server/protected-bff-adapter.ts` - protected adapter seam used only as transport proof.
- `apps/api/src/common/*` - global request-ID middleware and DTO validation pipe.
- `apps/api/src/app.module.ts` - global guard, validation, safe-filter, and request-ID wiring.
- `apps/api/src/auth/resource-server.guard.ts` - uses the canonical request ID in safe authorization failures.
- `apps/api/src/safe-api-exception.filter.ts` - stable safe error projection and code/status mapping.
- `tests/*` - BFF/API integration and safe-envelope regression coverage.
- `epic-9-context.md` - runtime context artifact produced for the Epic 9 implementation run.

### Review

Independent blind and edge-case review found three in-scope issues: missing global bearer enforcement, malformed runtime violation handling, and irrelevant field violations. All were repaired and regression-tested. No items were deferred or rejected.

### Verification

- `timeout 180s pnpm exec vitest run tests/api-request-principal.integration.test.ts tests/safe-api-exception.filter.test.ts tests/bff-credentials.test.ts tests/bff-session-route.test.ts tests/bff-transport.test.ts tests/safe-validation.pipe.test.ts` - passed, 6 files and 46 tests.
- `pnpm typecheck` - passed.
- `pnpm lint` - passed with 0 errors and 4 pre-existing warnings.
- `pnpm build` - passed.
- `git diff --check ac7ce47c6002486fd1949faf6f4ec0dab723e4fe` - passed.

### Residual Risks

The test transport adapter remains intentionally non-production. Story 9.4 must explicitly own the first capability cutover and the public health/version contract.
