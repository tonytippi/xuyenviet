---
title: Direct API and NestJS-Owned Session Authentication Course Correction
date: 2026-08-03
project: xuyenviet
status: approved
mode: batch
change_scope: major
source:
  - prds/prd-xuyenviet-2026-07-04/prd.md
  - prds/prd-xuyenviet-2026-07-04/addendum.md
  - architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md
  - epics.md
  - implementation-artifacts/sprint-status.yaml
supersedes_on_approval:
  - API-first Runtime and Launch Readiness Course Correction (2026-07-28), BFF transport and Auth.js ownership decisions only
---

# Sprint Change Proposal: Direct API and NestJS-Owned Session Authentication

## 1. Issue Summary

The approved API-first implementation created a NestJS API, shared contracts/domain/database packages, a Worker, and a separate admin application. However, the previous architecture retained Next.js/Auth.js ownership of browser sessions and required a BFF between each browser capability and NestJS. The resulting migration has multiple concurrent owners:

- Root `src/` retains Auth.js, database access, server actions, route handlers, and most feature use cases.
- `apps/api` owns selected protected API capabilities and assumes short-lived BFF JWT credentials.
- `apps/admin` exists, while the root Next.js application still owns the legacy `/admin` surface.
- Capability cutovers require a legacy implementation, BFF adapter, Nest controller, and retirement path at once.

This transport design is the primary source of unfinished, duplicated migration work. Continuing the BFF strategy would preserve two authentication authorities and add new code to the legacy root application while capabilities are still being moved.

The approved direction is a clean break:

> NestJS is the sole authentication and domain API owner. Traveler web and the separate admin application are presentation clients that call the public versioned API directly. Browser clients authenticate with NestJS-managed opaque PostgreSQL sessions in secure HttpOnly cookies. Business BFF code and Auth.js are retired.

The product scope does not change. Google login remains required for AI Ask, ownership and role authorization remain server-enforced, and future native mobile remains deferred.

## 2. Impact Analysis

### Checklist Results

| Item | Status | Finding |
| --- | --- | --- |
| 1.1 Trigger | Done | API/BFF Stories 9-13 exposed the duplicated root/BFF/API ownership while only a subset of features completed the cutover. |
| 1.2 Problem | Done | Failed architecture approach for this repository stage: BFF requires duplicated authentication, transport adaptation, fallback, and retirement work for every capability. |
| 1.3 Evidence | Done | Root `src/` still owns Auth.js, route handlers, server actions, direct database calls, and legacy `/admin`; Nest owns only selected slices; completed API stories are explicitly BFF-dependent. |
| 2.1-2.5 Epic impact | Done | Completed Epics 9-13 remain historical implementation evidence but do not satisfy the new direct-browser transport. Their BFF-only outcomes are superseded, not rolled back. Epic 14 must be replaced by consolidation/cutover work. |
| 3.1 PRD impact | Done | FR-51, FR-52, FR-54, NFR-14, NFR-15, and ADR-32-1/3 conflict with direct browser API and Nest-owned opaque sessions. Product behavior and MVP scope do not conflict. |
| 3.2 Architecture impact | Done | AD-1, AD-4, AD-14, AD-15 and the API-first addendum need a direct API/session ownership update. |
| 3.3 UX impact | Done | Sign-in/sign-out/session-expiry and safe retry recovery must be API-client behavior. Existing visual and accessibility requirements stay valid. |
| 3.4 Secondary impact | Done | OpenAPI security, environment configuration, Docker/ingress routes, API integration tests, deployment evidence, root dependencies, and project context require updates. |
| 4.1 Direct adjustment | Viable | High effort, medium risk. Add a single consolidation program and migrate by capability with one writer. |
| 4.2 Rollback | Not viable | Reverting completed API/worker/admin foundations loses reusable behavior and does not remove the root legacy ownership. |
| 4.3 MVP review | Not viable | The product MVP remains achievable. This is runtime simplification, not a product scope reduction. |
| 4.4 Selected path | Done | Clean-break direct adjustment: replace BFF/Auth.js transport ownership and retire legacy capability owners incrementally. |

### Artifact Conflicts

| Current statement | Conflict | Approved replacement on implementation |
| --- | --- | --- |
| FR-52 keeps browsers behind the Next.js BFF. | Browsers must call NestJS directly. | Browser clients call the versioned NestJS API using only a cookie session; they receive no database credential or internal service credential. |
| FR-54 maps BFF credentials to API principals. | There is no BFF credential after cutover. | NestJS resolves each protected request to a domain-neutral principal from its own browser session. |
| ADR-32-1 and ADR-32-3 require BFF JWTs and bearer-only private API. | Direct API needs cookie authentication, CSRF, and controlled browser origins. | NestJS owns Google OAuth, opaque sessions, CSRF and direct public API admission. |
| Addendum says Next.js is a browser BFF and Auth.js is the web/admin session owner. | This creates the duplicated authority to remove. | Next.js applications are presentation clients only; NestJS is the sole session authority. |

### Technical Invariants To Preserve

- PostgreSQL remains the only product, job, and session state plane; Drizzle remains the migration owner.
- `RequestPrincipal` remains the only input to authorization and domain policy. Controllers and domain use cases never depend on a cookie implementation.
- Every aggregate command has exactly one writer. Migration compares safe reads only; it never dual-writes.
- API safe error envelopes, request correlation, owner-scoped reads, role checks, command idempotency, fences, outbox dispatch, and Worker isolation remain mandatory.
- Web and PWA use browser sessions. Native mobile is explicitly deferred; when needed it adds a bearer/PKCE adapter without changing API/domain authorization.

## 3. Recommended Approach

**Selected approach: clean-break direct adjustment.**

Do not move files mechanically and do not retain the BFF as a compatibility layer. Establish one authentication owner first, then migrate capability vertical slices and delete their root/BFF owners in the same story.

### Browser Session Model

NestJS owns Google OAuth and an opaque, database-backed browser session:

- The browser cookie contains only an unguessable session identifier.
- Cookie settings are `HttpOnly`, `Secure`, host-only where deployment permits, `Path=/`, and `SameSite=Lax` by default.
- Sessions have a 30-day sliding expiry. A valid active request renews only when its remaining lifetime is below a bounded renewal window, such as seven days.
- The server checks expiry, revocation, user state, and `authorizationVersion` before creating a principal.
- Mutation requests use NestJS CSRF validation. Direct API CORS/origin policy is allowlisted and never wildcarded with credentials.
- Logout revokes the database session and clears the cookie. Role changes and account disable invalidate established sessions through existing authorization-version/session checks.

This model provides persistent browser/PWA login and immediate revocation without access JWT, refresh-token rotation, token-family management, or browser token storage. Native mobile is not implemented by this change.

### Deployment Shape

Prefer a same-site public origin through an ingress/router:

```text
https://app.xuyenviet.vn/       -> traveler Next.js presentation app
https://app.xuyenviet.vn/v1/*   -> NestJS API
https://app.xuyenviet.vn/auth/* -> NestJS auth endpoints
https://admin.xuyenviet.vn/     -> separate admin presentation app
```

The ingress only routes requests and terminates transport; it contains no authentication or domain behavior and is not a BFF. The final domain/host topology is an Epic 14 deployment-evidence decision.

## 4. Detailed Change Proposals

### 4.1 PRD and Addendum

**Change:** Update only runtime/auth transport requirements. Preserve product requirements, API versioning, one-writer migration, separate admin app, and future mobile non-goal.

**Replace:**

```text
FR-52: Keep the traveler browser behind the Next.js BFF; do not give it an internal API credential or allow it to call the private domain API directly.
FR-54: Authorize every protected API read and command with a domain-neutral request principal mapped from short-lived, audience-scoped BFF credentials.
```

**With:**

```text
FR-52: Traveler and operator browser clients call documented versioned NestJS APIs directly using only NestJS-managed secure session cookies. They receive neither database credentials nor internal service credentials.
FR-54: NestJS authorizes every protected API read and command with a domain-neutral request principal resolved from a live, opaque server-side session and current authorization state.
```

**Replace ADR-32-1/3:** BFF JWT issuance, private bearer-only browser prohibition, and BFF key rotation.

**With ADR-33:** NestJS owns Google OAuth callback, opaque session issuance/renewal/revocation, cookie and CSRF policy, allowlisted browser origins, and normalization to `RequestPrincipal`; no domain/API code depends on Auth.js, BFF credentials, or cookie parsing.

**Rationale:** Directly supports browser and PWA while leaving a future mobile bearer/PKCE adapter outside MVP scope.

### 4.2 Architecture

**Change AD-1:** Next.js remains the traveler presentation application, not a full-stack runtime or BFF domain owner.

**Change AD-4:** Replace Auth.js as the Google OAuth/session authority with NestJS-owned OAuth and opaque PostgreSQL sessions. The existing `users`, `accounts`, and `sessions` data may be reused during implementation, but NestJS becomes the sole reader/writer of live sessions after cutover.

**Add AD-33: Direct Browser API and Session Authority**

```text
NestJS is the sole browser authentication and API authority. Browser-facing applications hold no database credentials, BFF signing keys, or domain writers. A secure HttpOnly opaque session cookie is resolved server-side to a current RequestPrincipal. NestJS owns OAuth, session lifecycle, CSRF, allowed origins, safe errors, and request correlation. Every protected capability is direct API-only after its cutover; its matching root route handler, server action, BFF adapter, and direct database access are retired together.
```

**Rationale:** Makes the transport owner explicit and prevents a new feature from recreating root backend behavior.

### 4.3 Epic and Sprint Backlog

**Retire the planned form of Epic 14:** Its BFF adapter inventory and public-launch evidence scope cannot be completed under the selected architecture.

**Create Epic 14: Direct API Consolidation and Legacy Retirement** with these ordered stories:

1. **14.1 Establish NestJS Google OAuth, opaque browser sessions, and direct API admission.** Create session/cookie/CSRF/origin/principal contract; migrate traveller login/session/logout; stop issuing new Auth.js sessions. This story is the prerequisite for every direct browser API request.
2. **14.2 Cut AI Ask and traveler shell reads to direct API.** Point the traveler UI at direct `/v1` endpoints; remove Next stream proxy, BFF credentials/client, transport selectors, and legacy AI Ask writer for the migrated scope.
3. **14.3 Move traveler commands and remove root domain writers.** Cut trip/conversation/proposal/feedback/referral behavior by vertical slice; remove matching server actions/direct DB imports when each slice is complete.
4. **14.4 Complete admin direct API ownership.** Move remaining root `/admin` workflows into `apps/admin`, direct them to `/v1/admin`, and retire the legacy root admin pages/actions.
5. **14.5 Retire Auth.js, BFF runtime, and legacy transport.** Remove Auth.js routes/dependencies and all remaining BFF credential/transport configuration only after an inventory proves zero live capability owner remains in root backend code.
6. **14.6 Produce direct-API launch evidence.** Validate ingress/origin/cookie/CSRF topology, migration-before-traffic, one-writer inventory, rollback, OAuth smoke, worker readiness, monitoring, backup/restore, and load/concurrency evidence.

**Story completion rule:** A migrated capability is not complete until browser/admin uses the direct API, there is one command writer, API integration coverage proves authorization/ownership, and the matching BFF/legacy owner is deleted in the same story.

**Historical records:** Preserve completed Epic 9-13 story records and their test evidence. Mark BFF-specific statements as superseded by this course correction; do not claim they implement direct browser access.

### 4.4 Engineering Freeze Rules

Effective after approval:

- Do not add a Next.js route handler, server action, BFF credential, BFF client, transport selector, shadow read, or direct DB access as a new domain capability owner.
- Do not import root `src/` domain code into `apps/api`, `apps/worker`, or `apps/admin`.
- New domain policy/use cases go to `@xuyenviet/domain`; PostgreSQL repositories to `@xuyenviet/database`; request/response schemas to `@xuyenviet/contracts`; HTTP adapters to `apps/api`.
- Root `src/` and `apps/admin` may contain UI, route rendering, and typed API clients only after their capability cutover.
- Do not retain a legacy writer after direct API rollout. Read-only parity comparison is allowed only behind explicit non-production/staging evidence and never changes browser behavior.

### 4.5 UX and Deployment Updates

- Replace Next server-side session resolution with a direct API session/read client and explicit unauthenticated recovery.
- Preserve the current Vietnamese sign-in, sign-out, session-expiry, AI Ask reconnect, and safe error UX. Do not expose OAuth, session IDs, CSRF details, provider failures, or database errors.
- Update OpenAPI from `bearerAuth` BFF-only security to cookie session and CSRF requirements.
- Update Docker/Compose/Railway routing and health documentation for a direct browser API; remove BFF credential secrets and signing-key configuration once retired.
- Add direct API cookie/CSRF/origin/session expiry/renewal/revocation integration tests before feature migrations.

## 5. Implementation Handoff

**Scope classification: Major.** This changes runtime ownership and deployment/auth boundaries but retains the product scope, database, API contracts, worker design, and domain rules.

| Recipient | Responsibility |
| --- | --- |
| Product Manager | Confirm product scope is unchanged and approve a one-time re-login policy if legacy Auth.js sessions cannot be safely adopted. |
| Solution Architect | Update PRD/addendum, architecture invariants, direct API security contract, ingress topology, and legacy retirement conditions. |
| Product Owner / Developer | Update epics/sprint status; create and validate Story 14.1 before code changes; enforce freeze rules. |
| Developer | Implement direct auth first, then capability cutovers in exact order; remove old owners with every completed slice. |
| QA / Platform Owner | Own API integration proof and staging/public launch evidence for cookie policy, origin policy, migration order, OAuth, rollback, Worker, and operational readiness. |

### Success Criteria

1. NestJS is the only production owner of Google OAuth, browser session creation, renewal, revocation, CSRF and protected API principals.
2. Traveller web and `apps/admin` have no database credentials, BFF credentials, Auth.js session dependency, or domain mutation imports.
3. Each completed capability has one direct API writer and no matching Next route/server action/BFF adapter/legacy writer.
4. Browser/PWA users retain a live opaque session through normal use for the configured sliding window and receive safe reauthentication after expiry/revocation.
5. `apps/api` and `apps/worker` do not import root `src/` business/domain code.
6. Auth, ownership, CSRF, origin, expiry, renewal, logout/revocation and safe-error integration tests pass.
7. Launch evidence proves the direct API topology, no legacy transport owners, migration ordering, rollback, and operational readiness.

### Explicit Decisions Required Before Story 14.1

1. **Legacy-session policy:** clean break, requiring every existing user to log in once after deployment, is recommended unless there is demonstrated durable production session data that requires a separately designed adoption migration.
2. **Public routing:** same-site ingress routing is recommended for the first cutover; host/domain values remain deployment-owned.
3. **Session duration:** 30-day absolute sliding renewal window with a seven-day renewal threshold is the proposed default; product owner may choose 60 days before implementation.

## 6. Workflow Execution Log

- 2026-08-03: User identified BFF/Auth.js transport as the source of fragmented and unfinished ownership and requested a consolidation direction.
- 2026-08-03: User selected opaque, database-backed session cookies for web/PWA and explicitly deferred mobile-native auth implementation.
- 2026-08-03: This proposal was drafted in batch mode.
- 2026-08-03: Tony approved the clean break, one-time re-login policy, 30-day sliding browser session with a seven-day renewal threshold, and same-site ingress routing. Source-of-truth artifacts may now be updated.
