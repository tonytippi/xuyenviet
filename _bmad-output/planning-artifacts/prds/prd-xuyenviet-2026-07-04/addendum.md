# XuyenViet AI Travel Information MVP PRD Addendum

## Source Inputs

- Brainstorming intent: `_bmad-output/brainstorming/brainstorm-ai-travel-info-mvp-2026-07-04/brainstorm-intent.md`
- Market landscape research digest captured during PRD creation.

## Resolved Product Decisions

- Public MVP surface: AI Ask chat.
- Launch intent: public MVP entry with authenticated AI Ask.
- Initial geography: Hanoi-to-HCMC road-trip corridor.
- User language: Vietnamese.
- Authentication: Google Login.
- Access model: public sign-in without an email allowlist; Google Login is required before AI Ask.
- Initial operator model: owner/admin first, expandable to operators later.
- Minimum public-MVP seed data target: 100 active, evidence-grounded knowledge cards.
- Initial confidence labels: `unverified`, `community`, `curated`, `partner`, `official`.
- Source display minimum: source title/label, source type, URL when available, collected/checked date when available, confidence label, and freshness warning when applicable.
- Community knowledge uses AI-first provisional publication: qualifying claims may be active without operator approval, while AI recommends prioritized review only for risk, weak evidence, freshness, duplicate, or conflict signals.
- Operator approval is a signal of review, not a mandatory retrieval gate. Active claims must preserve validated source evidence and use state-aware uncertainty wording.
- Initial active-publication thresholds are relevance >= 0.75, extractability >= 0.70, evidence grounding >= 0.90, specificity >= 0.65, actionability >= 0.65, first-hand likelihood >= 0.55, and spam/commercial risk <= 0.25, subject to hard evidence/privacy/safety gates.
- Initial quality monitoring samples 15% of auto-active claims for the first four weeks and 100% of `verify_first` claims.
- Trip Planning Foundation is the next approved scope tranche: single-owner structured itinerary, trip constraints, one primary conversation, basic Trip Home, and user-confirmed change proposals with history.
- Trip Home focus policy: pending expiring proposal, pending proposal, defined confirmed-item gap, next dated planned/confirmed leg, then preparation. Explicit lifecycle phases and on-trip today focus remain deferred.
- `confirmed` means owner confirmation or a supplied real constraint, not booking/provider validation; booking and availability remain out of scope.
- Proposal application uses aggregate/item version fences and structural preconditions; a stale proposal applies nothing and returns a safe refresh-required result.

## Provisional Assumptions For Architecture

- Preferred AI access path: OpenAI-compatible AI Gateway, not direct OpenAI API calls.
- The AI Gateway must be configured with its base URL and API key per environment; downstream model/provider data-use settings must ensure project/user data is not used to train provider models where configurable.
- Web search fallback is required in MVP because curated data starts sparse.
- Web search provider is an architecture decision, but must support Vietnamese, source URLs/titles/snippets, provenance capture, and official/provider-source preference.
- Architecture must define publication, knowledge, and review state storage; independent AI evaluation; citation-span validation; suppression propagation; dedup/conflict handling; and retrieval metadata/wording enforcement for active provisional community claims.
- Architecture must make high-risk conflict detection immediately de-index or downgrade a claim, and must implement 180-day deletion for Facebook raw text that supports no active or reviewable claim.
- Google Maps integration is post-MVP.
- Memory correction can be chat-based in MVP.
- Memory deletion must support user-owned chat session and trip project deletion for MVP, with deletion propagation defined by architecture before implementation.
- Conversation transcript retention must follow the final PRD and privacy notice; do not treat earlier debugging-retention assumptions as active requirements unless a later privacy decision reinstates them.
- Architecture must define the Trip Project aggregate boundary, primary-conversation migration, owner-scoped plan/proposal commands, proposal expiry/conflict handling, audit history, and deletion propagation for all derived Trip Planning data.
- Weather, location, Google Maps/Places/Routes, booking/OTA data, dynamic provider snapshots, budget, checklists, travel vault, collaboration, and notifications remain deferred from the Trip Planning Foundation tranche.

## Approved API-First Runtime Direction

- NestJS will own the versioned domain API, authorization boundary, extracted use cases, and dedicated worker bootstrap. This remains a modular monolith: it does not introduce microservices, database-per-service, an event bus, or a new queue platform.
- Next.js remains the traveler presentation layer only. A separate Next.js admin app has its own deployment and origin and uses the same direct API boundary and domain policy. Neither frontend receives database credentials, internal service credentials, or domain writers.
- The target workspace has `web`, `admin`, `api`, and `worker` applications with narrowly extracted `database`, `domain`, `contracts`, and `config` packages. Existing root Next.js code moves only as a vertical slice needs a shared consumer; there is no big-bang reorganization.
- PostgreSQL remains the only product and job data plane, and Drizzle remains the only schema/migration owner. Existing transactions, `FOR UPDATE SKIP LOCKED`, claims, leases, fencing tokens, and idempotency protocols are preserved by workers and use cases.
- The initial deployment target is Railway. Same-site ingress routes `/v1/*` and `/auth/*` to NestJS while the traveler presentation app owns the remaining web routes. The separate admin origin calls the direct API under an allowlisted browser-origin policy.
- NestJS owns Google OAuth, opaque PostgreSQL browser sessions, cookie issuance/renewal/revocation, CSRF validation, and `RequestPrincipal` normalization. Browser clients receive only an HttpOnly secure opaque session cookie. A future native-mobile bearer/PKCE adapter is deferred and must normalize to the same principal without changing domain authorization.
- API contracts use `/v1`, OpenAPI, task-oriented read models, safe errors, validation, scoped authorization, cursor pagination where required, and typed direct API clients. Generated SDKs are deferred.
- AI Ask retains NDJSON initially. Its Nest API slice must preserve `preparing`, `delta`, `done`, and `error`, abort handling, final policy checks, and atomic terminal assistant/provenance/usage persistence. `after()`-based context extraction is replaced by a durable worker-dispatch port.
- Continuous worker loops run in the dedicated worker service. Railway Cron is restricted to bounded `--once` sweeps. Facebook and YouTube capture remain operator-controlled runtimes outside the Railway worker.
- Public launch requires a clean cutover: each aggregate command has one writer, no dual-write occurs, Auth.js/BFF and the legacy `/admin` surface are retired, and no Next.js server action or route handler remains a domain transport owner. Rollback changes traffic or compatible code, never destructively rolls back schema.
- Four pre-cutover spikes must produce decision records and failure-mode tests: identity/resource-server behavior, Nest AI Ask NDJSON streaming, Railway/monorepo deployment, and worker lifecycle/operations. Railway ownership, domains, secrets, backup/restore, monitoring, and on-call policy remain an explicit pre-staging/public-launch decision.

## Market Context Digest

- AI trip planners commonly converge on chat-to-itinerary plus booking marketplace flows.
- Road-trip-specific competitors emphasize route optimization, stop discovery, map-first planning, and logistics.
- Strong products combine AI generation with manual control; generated plans should be treated as drafts.
- Most competitors use third-party trust surfaces rather than detailed citations, leaving room for XuyenViet to differentiate on source, last-checked, and confidence labels.
- Personalization is shifting toward persistent preference memory and imported context.
- Vietnam travel information is rich but fragmented and often static.
- Freshness risk is high for road trips: prices, road conditions, hours, parking, weather, service availability, traffic restrictions, and seasonal events change often.

## Still Open

- Exact web search provider/mechanism.
- Exact privacy-policy wording for AI Gateway-backed memory and chat processing.
- Whether source URLs are always visible by default or hidden behind expandable details.
- Detailed Facebook content reuse policy beyond provenance and non-official labeling.
- Legal/content-reuse policy and UI behavior for traveler-visible short Facebook-derived quotes and links.
