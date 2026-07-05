---
title: Sprint Change Proposal - AI Usage Tracking And Referral Attribution Capture
status: approved
created: 2026-07-05
workflow: bmad-correct-course
change_scope: minor-to-moderate
---

# Sprint Change Proposal - AI Usage Tracking And Referral Attribution Capture

## 1. Issue Summary

### Trigger

The product owner identified future monetization and growth features that are not required for the current MVP but should influence app design:

- Credit system for paid AI usage and user deposits.
- Marketing credit earning such as daily check-in.
- Referral system where referrers can earn bonus value when referred users register and spend money.
- Reward balance separate from credit, with future conversion from reward to credit.
- User ranking tiers that can affect referral percentages.
- Affiliate programs for booking and shopping links.

The product decision is to include only two future-compatible capabilities in MVP:

- AI usage tracking.
- Referral attribution capture.

Credit wallets, payments, rewards, rankings, reward-to-credit conversion, affiliate automation, and commission-based answer ranking remain post-MVP.

### Core Problem

The current PRD, architecture, and epics explicitly defer booking, payment, and partner flows, but they do not yet preserve enough future-facing structure for:

- measuring AI usage cost per authenticated user,
- later introducing credit-based AI pricing without changing AI orchestration,
- preserving referral attribution at sign-up time before it becomes unrecoverable.

### Evidence

- PRD Non-Goals currently exclude booking, payments, and partner transaction flows.
- Architecture Deferred section currently excludes booking, payment, and partner flows.
- Architecture core data contracts do not include AI usage events or referral attribution.
- Epic 1 foundation currently handles auth, roles, audit, and environment safety, but not referral capture.
- Epic 2 and Epic 5 touch AI calls and orchestration, but do not explicitly persist usage events for future billing/cost analysis.

## 2. Impact Analysis

### Epic Impact

Epic 1: Public Sign-In And App Foundation

- Add referral attribution capture to public entry/sign-in flow.
- Store referral code and inviter relationship when a user signs in/registers through a valid referral link.
- No referral reward, payout, percentage, ranking, or conversion behavior in MVP.

Epic 2: AI Ask Conversation Experience

- Add basic AI usage event recording for user-submitted AI requests.
- Usage events should be persisted for future cost analysis and credit pricing.
- No user-facing credit balance, quota, top-up, or paywall in MVP.

Epic 5: Grounded Retrieval, Web Search, And Provenance

- AI orchestration should persist usage metadata for model/search calls and answer generation events.
- Usage tracking must not replace answer provenance; it is a separate operational/accounting signal.

Epic 6: Family-Aware Planning And Public MVP Quality Loop

- No direct functional change.
- Usage tracking may later help correlate cost with answer quality, but this is not required for MVP evaluation.

### Story Impact

Stories requiring direct updates:

- Story 1.1: Initialize Public MVP Web App Foundation.
- Story 1.2: Public Sign-In Entry And AI Ask Gate.
- Story 1.3: Google Login With Auth.js.
- Story 2.2: Create Conversation And Send First Message.
- Story 2.3: Generate Vietnamese Initial AI Answer.
- Story 5.x in Epic 5 related to AI orchestration/provenance should include usage persistence where the final story text defines orchestration.

Potential new stories:

- Add Story 1.7: Capture Referral Attribution At Sign-Up.
- Add Story 2.7 or Epic 5 story: Record AI Usage Events.

Recommended minimal path: add one story to Epic 1 for referral attribution and one story to Epic 2 or Epic 5 for AI usage tracking. Do not expand existing stories too much.

### Artifact Conflicts

PRD:

- Needs explicit Must/Should/Could wording for AI usage tracking and referral attribution capture.
- Needs Non-Goals refined so payments/credits/rewards/affiliate automation remain deferred.
- Needs functional requirements added for usage events and referral attribution.
- Needs acceptance criteria updated so MVP includes these hidden foundation behaviors.

Architecture:

- Needs new feature ownership boundaries: Usage/Billing Readiness and Referrals, or fold into Feedback/Eval and Auth for MVP with explicit future split.
- Needs data contracts for `ai_usage_events`, `referral_codes`, and `referral_attributions` or a simpler equivalent.
- Needs rule that AI usage tracking is append-only operational telemetry and not a credit ledger.
- Needs rule that referral attribution creates no reward liability in MVP.
- Needs deferred section refined to distinguish future credit/payment/reward/affiliate systems from MVP tracking hooks.

Epics:

- Needs story additions or story updates to cover two new requirements.
- Needs FR inventory and coverage map updated after PRD adds requirements.

UX:

- No UX design contract exists.
- Minimal UI impact: public links may carry `ref` parameter; no visible referral dashboard or credit UI in MVP.

Technical:

- Add DB tables through Drizzle migrations during implementation.
- Add server-side capture during auth/sign-in flow.
- Add server-side usage event writes around AI provider/search/orchestration calls.
- Ensure usage events do not store full prompt/response content unless already governed by message/provenance storage.

## 3. Recommended Approach

### Selected Path

Direct Adjustment.

### Rationale

This change is future-facing and bounded. It does not change the core MVP promise, launch surface, AI answer requirements, knowledge workflow, or retrieval architecture. It adds two small foundation capabilities that are cheap now and harder to reconstruct later.

### Alternatives Considered

Potential Rollback:

- Not applicable. No implementation has started and no completed stories need rollback.

PRD MVP Review:

- Not needed. The MVP remains achievable if this scope stays limited to tracking and attribution capture.
- Full credit, payment, reward, ranking, and affiliate features must remain post-MVP.

### Effort Estimate

Low-to-medium.

- AI usage tracking: medium if captured across chat, extraction, embedding, eval, and search; low if limited to user-facing answer generation events.
- Referral attribution capture: low if it only stores referral code/user relationship at sign-up.

### Risk Level

Low if strictly scoped.

Main risk: scope creep into payment, wallet, referral rewards, or affiliate ranking. The proposal explicitly excludes those.

## 4. Detailed Change Proposals

### PRD Changes

#### PRD Section 3: Non-Goals

Current:

```markdown
- Booking, payments, or partner transaction flows.
```

Proposed:

```markdown
- Booking, payments, credit wallets, reward balances, referral payouts, ranking-based rewards, or partner transaction flows.
- Affiliate automation or commission-based answer ranking.
```

Rationale: keeps the new future-aware hooks from becoming monetization scope.

#### PRD Section 6.1: Must Have

Add:

```markdown
- AI usage tracking for authenticated AI requests, so future credit-based pricing can be introduced without changing the AI orchestration flow.
```

Rationale: usage tracking belongs in MVP because every AI answer already passes through orchestration.

#### PRD Section 6.2: Should Have

Add:

```markdown
- Referral attribution capture when a new user registers through a referral link, without MVP rewards or payout behavior.
```

Rationale: attribution is useful to capture early but should not block MVP if implementation pressure rises.

#### PRD Section 8: Functional Requirements

Add after FR-46:

```markdown
- FR-47: The system shall record AI usage events for authenticated AI requests, including user, conversation or trip context when applicable, AI purpose, provider/model, timestamp, and available usage/cost metadata.
- FR-48: The system shall capture referral attribution when a new user signs in or registers through a valid referral link, without calculating rewards, ranking, payout, or credit conversion in MVP.
```

Rationale: makes scope testable and traceable in epics.

#### PRD Section 10: MVP Product Contracts

Add new subsection:

```markdown
### 10.5 Usage And Referral Readiness Contract

- AI usage tracking is for cost visibility, abuse investigation, and future pricing design; MVP shall not show or enforce credit balances.
- Usage events shall not become the source of truth for chat content or answer provenance.
- Referral attribution capture stores who referred a new user and the referral code or campaign used when available.
- MVP referral attribution does not create reward liability, payout entitlement, ranking status, or credit conversion.
```

Rationale: prevents ambiguous business obligations.

#### PRD Section 13: MVP Acceptance Criteria

Add:

```markdown
- AC-15: Authenticated AI requests create AI usage records with enough metadata to support future cost analysis.
- AC-16: A valid referral link can be captured during sign-in or registration and associated with the new user without exposing referral reward UI.
```

Rationale: confirms implementation behavior without requiring monetization UI.

### Architecture Changes

#### Architecture AD-5: Feature Ownership Boundaries

Current:

```markdown
Binds: module ownership to these domains: Auth, Chat/Trips, Knowledge, Retrieval, Search, AI Orchestration, Admin, Feedback/Eval, Audit.
```

Proposed:

```markdown
Binds: module ownership to these domains: Auth, Chat/Trips, Knowledge, Retrieval, Search, AI Orchestration, Admin, Feedback/Eval, Usage, Referrals, Audit.
```

Rationale: usage and referral data should not be hidden inside unrelated modules once persisted.

#### Architecture AD-6: Mutations Are Server-Side And Audited

Add:

```markdown
Rule: Usage owns append-only AI usage events. Usage events are operational/accounting telemetry and must not be treated as credit ledger entries.

Rule: Referrals owns referral codes and referral attribution. MVP referral attribution records do not create rewards, balances, payout obligations, ranking status, or credit conversion.
```

Rationale: separates future billing/reward concepts from MVP tracking.

#### Architecture AD-10: OpenAI Access Is Adapter-Based And Source-Bundled

Add:

```markdown
Rule: AI provider adapter calls must return or emit usage metadata when available, including model, token counts, provider request ID if available, latency, and failure status. The Usage module persists this metadata without storing raw prompt/response content beyond existing message/provenance records.
```

Rationale: tracks cost without duplicating sensitive content.

#### Architecture Shared Data Contracts

Current core entities:

```markdown
- `users`, `accounts`, `sessions`, `roles`
- `trip_projects`, `conversations`, `messages`, `chat_context`, `assistant_response_provenance`
- `context_embeddings`
- `sources`, `raw_source_material`, `knowledge_cards`, `knowledge_card_embeddings`
- `web_search_results`, `feedback`, `eval_runs`, `audit_events`
```

Proposed:

```markdown
- `users`, `accounts`, `sessions`, `roles`
- `referral_codes`, `referral_attributions`
- `trip_projects`, `conversations`, `messages`, `chat_context`, `assistant_response_provenance`
- `context_embeddings`
- `sources`, `raw_source_material`, `knowledge_cards`, `knowledge_card_embeddings`
- `web_search_results`, `ai_usage_events`, `feedback`, `eval_runs`, `audit_events`
```

Add:

```markdown
AI usage event minimum fields: user ID when available, conversation ID when applicable, trip project ID when applicable, message ID when applicable, purpose, provider, model, prompt version when applicable, request timestamp, latency, success/failure status, provider usage metadata when available, and estimated cost fields when configured.

Referral attribution minimum fields: referred user ID, referral code, referrer user ID when resolvable, campaign/source metadata when available, captured timestamp, and immutable first-attribution marker. MVP does not calculate reward amounts.
```

Rationale: defines future-compatible persistence without building billing.

#### Architecture Deferred

Current:

```markdown
- Google Maps integration.
- Public submissions, booking, payment, and partner flows.
- Mobile app and service decomposition.
```

Proposed:

```markdown
- Google Maps integration.
- Credit wallets, payment deposits, reward balances, referral reward calculations, ranking multipliers, reward-to-credit conversion, booking transactions, affiliate automation, and partner transaction flows.
- Mobile app and service decomposition.
```

Rationale: makes deferred monetization explicit.

### Epics And Story Changes

#### Requirements Inventory

Add:

```markdown
FR-47: The system shall record AI usage events for authenticated AI requests, including user, conversation or trip context when applicable, AI purpose, provider/model, timestamp, and available usage/cost metadata.

FR-48: The system shall capture referral attribution when a new user signs in or registers through a valid referral link, without calculating rewards, ranking, payout, or credit conversion in MVP.
```

#### Epic List

Update Epic 1 FRs covered:

```markdown
**FRs covered:** FR-8, FR-42, FR-43, FR-44, FR-45, FR-48
```

Update Epic 2 or Epic 5 FRs covered:

Preferred:

```markdown
Epic 5 covers FR-47 because usage tracking belongs closest to AI orchestration and provenance.
```

Update Epic 5 FRs covered:

```markdown
**FRs covered:** FR-29, FR-30, FR-31, FR-32, FR-33, FR-34, FR-35, FR-36, FR-37, FR-47
```

#### New Story 1.7: Capture Referral Attribution At Sign-Up

```markdown
As a product owner,
I want referral links to be captured when a new user signs in,
So that future referral programs can attribute registrations without adding reward behavior to MVP.

Acceptance Criteria:

Given a public visitor opens XuyenViet with a valid referral code in the URL
When they complete Google sign-in as a new user
Then the system stores referral attribution linking the new user to the referral code and referrer when resolvable
And the attribution is created server-side.

Given a referral code is invalid or missing
When the user signs in
Then sign-in still works normally
And no reward, credit, payout, or ranking state is created.

Given a user already has referral attribution
When they open a different referral link later
Then the first attribution is preserved unless an explicit admin correction feature is implemented later.
```

#### New Story 5.9: Record AI Usage Events

```markdown
As a product owner,
I want authenticated AI requests to create usage records,
So that future credit pricing and cost controls can be designed from real usage data.

Acceptance Criteria:

Given an authenticated user submits an AI Ask request
When the AI orchestration pipeline calls model, embedding, extraction, evaluation, or search providers where applicable
Then the system records AI usage events with user ID, conversation/message context when applicable, purpose, provider, model, timestamp, latency, success/failure status, and available provider usage metadata
And the usage record does not duplicate raw prompt or answer content beyond existing message/provenance storage.

Given provider usage metadata is unavailable
When the request completes
Then the usage event is still recorded with available metadata
And missing usage fields are represented safely without blocking the user answer.

Given future credit billing is not part of MVP
When usage events are stored
Then the system does not decrement credit, show balance, block requests for insufficient credit, calculate rewards, or create payment obligations.
```

## 5. Implementation Handoff

### Scope Classification

Minor-to-moderate.

This is a planning adjustment before implementation begins. It does not require redoing PRD, architecture, or the epic structure. It requires targeted edits to the existing PRD, architecture spine, and epics file.

### Handoff Recipients

Product/Planning:

- Update PRD with FR-47, FR-48, usage/referral contract, non-goals, and acceptance criteria.
- Update epics/stories with Story 1.7 and Story 5.9 or equivalent.

Architecture:

- Update architecture spine with Usage and Referrals domains, data contracts, and deferred monetization boundaries.

Developer agent later:

- Implement referral attribution during auth/sign-in story work.
- Implement AI usage events during AI orchestration/provenance story work.
- Do not implement payments, credits, rewards, rankings, or affiliate automation unless a later PRD update adds them.

### Success Criteria

- MVP still has no credit wallet, payment, reward, ranking, or affiliate automation feature.
- Authenticated AI requests produce usage records sufficient for future cost analysis.
- Referral links can attribute new user registration without creating reward liability.
- Architecture keeps future billing/reward systems separated from MVP tracking tables.
- Readiness check passes after PRD, architecture, and epics are reconciled.

## 6. Checklist Results

- [N/A] 1.1 Triggering story: no implementation story revealed this; stakeholder future-feature discovery triggered it.
- [x] 1.2 Core problem defined: future monetization/growth readiness missing from current MVP foundation.
- [x] 1.3 Evidence collected from PRD, architecture, and epics.
- [x] 2.1 Current epic still viable.
- [x] 2.2 Epic-level changes identified for Epic 1 and Epic 5.
- [x] 2.3 Remaining epics reviewed.
- [x] 2.4 No new epic required.
- [x] 2.5 Epic order should not change.
- [x] 3.1 PRD impacts identified.
- [x] 3.2 Architecture impacts identified.
- [N/A] 3.3 UX spec: none exists; minimal UI impact.
- [x] 3.4 Secondary artifacts: future sprint plan/readiness report impacted after artifact edits.
- [x] 4.1 Direct Adjustment viable.
- [N/A] 4.2 Rollback not applicable.
- [x] 4.3 MVP Review considered; no MVP reduction required.
- [x] 4.4 Direct Adjustment selected.
- [x] 5.1 Issue summary created.
- [x] 5.2 Epic and artifact impacts documented.
- [x] 5.3 Path forward documented.
- [x] 5.4 MVP impact and action plan documented.
- [x] 5.5 Handoff plan established.
- [x] 6.1 Checklist completion reviewed.
- [x] 6.2 Proposal checked for consistency.
- [!] 6.3 Explicit approval pending from user.
- [N/A] 6.4 No sprint-status.yaml exists yet; sprint planning has not run.
- [!] 6.5 Next steps pending user approval.

## 7. Approval Request

Approve this proposal to update PRD, architecture, and epics with AI usage tracking and referral attribution capture while keeping credits, payments, rewards, rankings, and affiliate automation out of MVP.

Approved by user on 2026-07-05.
