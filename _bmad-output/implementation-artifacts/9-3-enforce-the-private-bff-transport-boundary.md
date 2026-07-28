# Story 9.3: Enforce the Private BFF Transport Boundary

Status: ready-for-dev

## Story

As a traveler or operator,
I want protected actions to stay behind the appropriate BFF,
so that browser-originated requests cannot bypass CSRF and API authorization controls.

## Acceptance Criteria

1. Given a capability-specific BFF mutation adapter receives a cookie-authenticated web or admin request, when it accepts the request, then it applies CSRF validation, validates and projects input, mints or forwards only a valid BFF credential, and maps the API safe error envelope to the presentation response. It forwards correlation ID, timeout/abort behavior, and `Idempotency-Key` where applicable.
2. Given any browser-originated request reaches the private API directly, when it lacks a valid BFF bearer credential, then the API rejects it without interpreting Auth.js cookies or browser session serialization and emits no CORS allow-origin response.
3. Given protected capability, health/version, and authorization failures are documented, when API contract checks run, then protected controllers accept only a normalized `RequestPrincipal` and return stable `code`, safe `message`, `requestId`, and applicable safe field violations. No controller exposes stack traces, SQL errors, cookies, or token contents.

## Tasks / Subtasks

- [ ] Establish shared BFF-to-API transport primitives (AC: 1)
  - [ ] Add a server-only thin BFF API client that obtains a Story 9.1 credential, calls only the configured private API base URL, forwards/generates correlation IDs, and preserves timeout/abort signals.
  - [ ] Define typed safe-error envelope parsing/mapping and typed safe field violations in shared contracts.
  - [ ] Forward `Idempotency-Key` unchanged only for capabilities that declare it; do not introduce idempotency behavior for unrelated calls.
- [ ] Establish BFF mutation protections (AC: 1)
  - [ ] Implement the approved reusable BFF-side CSRF policy before minting/calling the API: exact BFF `Origin`, allowed same-site Fetch Metadata when supplied, and a signed double-submit `X-XuyenViet-CSRF` header matching a host-only `Secure`, `SameSite=Strict`, `Path=/` CSRF cookie in constant time with signature/expiry validation.
  - [ ] Validate and project external input at the BFF boundary; forward only the capability DTO, correlation ID, applicable idempotency key, abort/timeout behavior, and internal bearer credential.
  - [ ] Keep cookies, Auth.js session serialization, provider tokens, raw `FormData`, and browser-only data out of the API request.
- [ ] Harden the Nest API transport boundary (AC: 2-3)
  - [ ] Make the API bearer-only for protected controllers; do not read Auth.js cookies or use Next/Auth.js imports.
  - [ ] Do not configure CORS allow-origin responses on the private API. Direct browser/cookie requests without a valid bearer must fail before capability logic.
  - [ ] Add correlation-ID middleware/interceptor, global request validation, and a safe exception filter that generates/retains `requestId`.
  - [ ] Ensure controllers receive a normalized `RequestPrincipal` plus validated DTO only; they must not independently parse authorization/session state.
- [ ] Document and verify transport failures (AC: 2-3)
  - [ ] Define stable error codes and Vietnamese-safe presentation copy mapping without exposing provider, token, SQL, stack, cookie, or raw-source details.
  - [ ] Test direct API requests with no bearer, malformed bearer, and cookies-only requests; assert denial and absence of `Access-Control-Allow-Origin`.
  - [ ] Test the capability-adapter seam with a protected transport test handler: CSRF rejection before any credential/API invocation, correlation generation/forwarding, abort/timeout propagation, declared idempotency-header forwarding, and safe-error redaction. This is transport proof only, not a second production capability owner.
  - [ ] Test that a protected controller cannot run from cookie/session serialization and receives only `RequestPrincipal`.

## Dev Notes

### Implementation Guardrails

- This story consumes the completed and verified Story 9.1 BFF credential, resource-server guard, and safe-error DTO. Do not duplicate signing, bearer parsing, session validation, `RequestPrincipal` creation, or the envelope shape.
- Start only after Story 9.1 completes. Its capability-adapter transport test must not cut over a real domain capability; the first real production read cutover remains Story 9.4.
- The private API is not a browser API. It uses `api.railway.internal`, bearer credentials only, and no CORS allow-origin header. Do not expose `api.xuyenviet.app` or add browser CORS as a convenience.
- CSRF belongs on web/admin BFF mutations because they authenticate the browser cookie. Use the AD-4 exact-origin, Fetch Metadata, signed double-submit policy; it is not a reason to let the API inspect a browser cookie.
- The BFF client is intentionally thin: no generated SDK and no domain authorization/persistence logic. The API/domain layer remains the authority.
- Correlation ID is safe operational metadata. Preserve it across BFF/API calls and use it in logs/errors, but do not put it into a reusable credential unless a future identity decision explicitly permits that.
- Health/version endpoints are introduced and contract-tested in Story 9.4. This story establishes their common error/telemetry rules but must not claim the platform contract is delivered yet.

### Existing Code to Preserve

- Current Next server actions under `src/features/*/actions.ts` are legacy BFF adapters. Do not broadly move all capability writes here; establish the reusable boundary and migrate one selected read in Story 9.4, then later capabilities one at a time.
- `src/app/api/ai-ask/stream/route.ts` remains the legacy AI Ask writer until Epic 10. Do not make it and a new Nest endpoint co-own a command.
- `src/app/api/health/route.ts` is a legacy Next route that combines environment and database checks. Preserve it until Story 9.4 provides explicit Nest liveness/readiness contracts and a cutover decision.
- Existing server helpers use safe operational errors and `server-only`. Preserve those boundaries while adding API-specific safe envelope projection.

### Suggested File Structure

- NEW `src/server/bff-api-client.ts`: server-only root-BFF adapter using Story 9.1 credential minting.
- NEW/UPDATE `src/server/csrf.ts` and `src/server/correlation-id.ts`: narrowly reusable BFF protections/metadata.
- NEW shared `packages/contracts/src/errors/*`: envelope, safe validation violation, and stable code types.
- NEW `apps/api/src/common/*`: correlation middleware, validation configuration, safe exception filter, and response projection.
- UPDATE `apps/api/src/auth/*`: wire protected controller guard use into the shared global behavior without duplicating crypto validation.

### Testing Requirements

- Add real BFF/API integration tests, not just client helper unit tests.
- Confirm safe-error envelopes contain only `code`, `message`, `requestId`, and permitted field violations, including unexpected exception paths.
- Verify browser-facing BFF output never includes an `Authorization` header, token string, cookie contents, or API-private configuration.
- Run targeted transport tests with the Story 9.1 identity suite, then `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

### Scope Boundaries

- No broad server-action migration, no admin app deployment, no AI Ask Nest streaming, no worker runtime, and no public API/mobile support.
- No API capability becomes a second owner merely by adding transport primitives. The first selected protected capability is cut over in Story 9.4 through an explicit routing switch.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 9.3: Enforce the Private BFF Transport Boundary]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-4: Identity Maps Into A Domain-Neutral Request Principal]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-6: Domain Use Cases Own Mutations, Authorization, And Audit]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#Operational Envelope]
- [Source: docs/proposals/nestjs-api-implementation-plan.md#API Error Và Observability]
- [Source: src/app/api/health/route.ts]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- 2026-07-28 independent review of `ac7ce47c6002486fd1949faf6f4ec0dab723e4fe..2d04e47a7def551ff20927bda84449befe858f18` ran Blind Hunter, Edge Case Hunter, and Acceptance Auditor synchronously. BLOCKED with two patch findings: MEDIUM `src/server/bff-api-client.ts:49-50,67-69` projects bounded upstream field violations for non-validation errors, which can disclose authorization/resource-detail signals; permit violations only for `validation_error` and add a regression. LOW `tests/api-request-principal.integration.test.ts:110-124,267-276` omits Origin/no-`Access-Control-Allow-Origin` assertions for no-bearer and malformed-bearer direct API requests required by AC2; add those assertions. Edge Case Hunter's future public health/version route guard concern is deferred: Story 9.4 expressly owns those endpoints and their contract. Focused transport suite passed: `pnpm vitest run tests/bff-transport.test.ts tests/api-request-principal.integration.test.ts tests/safe-api-exception.filter.test.ts tests/safe-validation.pipe.test.ts` (4 files, 38 tests).
- 2026-07-28 repair: field violations now project only from `validation_error` envelopes, with a forbidden-envelope regression. Direct no-bearer and malformed-bearer requests now carry `Origin` and assert no `Access-Control-Allow-Origin`. Targeted transport suite, typecheck, and diff check passed; status returned to ready-for-dev pending follow-up independent review.

### File List
