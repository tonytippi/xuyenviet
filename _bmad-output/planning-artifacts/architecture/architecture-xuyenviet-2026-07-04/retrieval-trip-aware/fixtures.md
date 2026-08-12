---
title: Retrieval And Trip-Aware Canonical Fixtures
status: final
updated: 2026-08-12
source_spine: ../ARCHITECTURE-SPINE.md
---

# Retrieval And Trip-Aware Canonical Fixtures

## Fixture Contract

Fixture IDs are stable architecture references for epics, stories, unit/integration tests, and evaluation cohorts. Implementations may add cases but may not weaken these outcomes.

Every executable fixture pins:

- synthetic or approved bounded corpus manifest;
- question and authenticated/URL scope;
- planning mode and exact Trip/proposal versions;
- registry snapshot and coverage assertions;
- requirement-profile and runtime-policy versions;
- expected per-stage include/exclude/clarify decisions;
- must-render and must-not-render contributions;
- final required-need outcomes and traveler outcome class.

## Multi-Turn Clarification And Scoped Preferences

| ID | Scenario | Expected |
|---|---|---|
| `CLAR-01` | Traveler asks “Lịch trình 7 ngày Hà Nội - Đà Nẵng” with no other context | Active session contains a `collecting` `multi_day_itinerary` instance; no detailed itinerary or one-way default; ask trip direction/end state, vehicle, and party composition |
| `CLAR-02` | Traveler replies “Hai vợ chồng, đi ô tô” | Party and vehicle resolve from exact evidence; trip direction remains missing; next clarification asks only whether seven days ends in Đà Nẵng or returns to Hà Nội |
| `CLAR-03` | Traveler then replies “Có quay lại Hà Nội” | Direction resolves to round trip; itinerary instance becomes `ready` and is claimed once; retrieval/main synthesis uses a seven-day round-trip scope |
| `CLAR-04` | Applied Trip already contains vehicle and party values | Preflight consumes the exact applied snapshot and does not ask those fields again; pending proposal values remain non-authoritative |
| `CLAR-05` | Traveler refuses a material field or says “cứ giả định” | No silent default; proceed only where the profile permits a traveler-visible bounded assumption, otherwise offer safe alternatives/skeleton or remain declined |
| `CLAR-06` | Traveler changes intent during collection | Existing session becomes `superseded`; a new profile/session starts without treating old unresolved fields as required for the new intent |
| `CLAR-07` | Traveler requests a three-day Đà Nẵng stay with a nicer hotel but simple sleep-only stays on transit stops | Values persist at destination-stay and transit-stay scopes; destination quality does not raise transit requirements and transit simplicity does not lower the destination stay |
| `CLAR-08` | Traveler answers lodging details but leaves meal/activity preferences absent | Accommodation deliverable may become ready; food/activity instances ask only their own material fields or proceed under their own safe-assumption policy; no global completeness shortcut |
| `CLAR-09` | A later reply contradicts an earlier value without clear scope | Field becomes `ambiguous`; server asks a scoped correction and does not silently overwrite either interpretation |
| `CLAR-10` | Conversation or Trip is deleted while clarification is collecting | Session, extracted values, message evidence references, and derived preflight telemetry are invalidated with the owner data |
| `CLAR-11` | One request asks for lodging, food, and activities; only lodging context is ready | One parent session contains three typed instances; an answer claim may include lodging only and must exclude blocked food/activity instances with their own pinned profiles |
| `CLAR-12` | Applied Trip supplies vehicle/party while the current message proposes a different vehicle | Values retain exact `applied_trip_snapshot` and `message_evidence` authority; mode/profile rules mark current-use ambiguity or exploration without rewriting Trip state |
| `CLAR-13` | Day-range, leg, place, and stay preferences intersect without a strict ancestry/precedence relation | Pinned scope comparator returns overlap and the affected field is `ambiguous`; recency cannot choose a winner |
| `CLAR-14` | Two replies, a duplicate delivery, and a slow older extractor race on one session revision | Exactly one CAS reduction per idempotency identity commits; stale/out-of-order results cannot lose newer values or overwrite ready/terminal state |
| `CLAR-15` | A ready instance is claimed, then a newer message changes intent before answer finalization | Final fence rejects the stale answer; no obsolete itinerary/message/provenance commits and the session is safely refreshed or superseded |
| `CLAR-16` | A profiled turn remains blocked after extraction | Existing AI Ask command persists the clarification assistant message and terminal success; no Retrieval run, web call, prompt manifest, provenance, or main-answer model usage exists |
| `CLAR-17` | Extraction model is missing, times out, returns invalid schema, or retries after a persisted result | Fail closed with persisted safe retry guidance and failure Usage; no streaming-answer substitution; replay reuses the terminal extraction result and makes no duplicate semantic call |
| `CLAR-18` | A permitted bounded assumption allows an instance to proceed | Assumed typed value, scope, policy, trigger, and disclosure are immutable; finalization fails if the exact disclosure is absent from the render manifest |
| `CLAR-19` | Source message repeats identical text supporting two different fields | Exact UTF-16 exclusive-end ranges identify each occurrence; digest-only or non-matching evidence is rejected |
| `CLAR-20` | A clarification reply is persisted while the background context extractor is configured | Profiled turn suppresses `ai_ask.context_extraction.v1`; one synchronous preflight owns readiness and no later Worker result can overwrite scoped values |
| `CLAR-21` | Journey basics become ready before exact transit stops/hotels are selected | Validated `clarification_plan` creates destination-stay and transit-stay group nodes plus scoped accommodation instances without choosing providers; later concrete stays bind beneath the correct group and inherit only compatible values |
| `CLAR-22` | A seven-day plan contains many meal/activity slots whose preferences are unspecified but optional under their profiles | Server does not interrogate every slot; only conditionally applicable material fields block, while optional preferences remain unset and can be refined later without global defaults |
| `CLAR-23` | Plan proposal exceeds node/instance/depth/parent/value/text caps or contains a cycle, duplicate, or orphan | Retrieval rejects it under the pinned `ClarificationPlanPolicy`; no graph/session delta persists and deterministic coalescing produces the same validated identity on retry |
| `CLAR-24` | Lodging answer completes while food remains collecting and activity is abandoned | Only claimed lodging completes; parent remains active until food completes or is abandoned, then completes atomically; a later request starts a new session/instance |
| `CLAR-25` | Two disjoint ready instances are claimed concurrently | CAS permits non-overlapping exact claims according to policy and parent remains active; duplicate/overlapping claim fails without changing instance state |
| `CLAR-26` | Initialization/evolution retries after graph validation or fails between plan attempt and session persistence | `initializeClarificationSession(...)`/`evolveClarificationPlan(...)` are idempotent by plan attempt and atomic for graph plus instances; no orphan graph or partial descendant is visible |
| `CLAR-27` | Conversation/Trip is deleted during plan creation or after one mixed instance completes | Instantiated graph revisions, validated plan results, target/task digests, plan/extract attempts, sessions, and payloads are invalidated; reusable profile/policy templates and non-content aggregates may remain |

## Planning Modes

| ID | Scenario | Expected |
|---|---|---|
| `PM-01` | Traveler asks about the current selected Trip route | `current_plan`; exact applied snapshot/path only; no pending or chat-only change appears committed |
| `PM-02` | Traveler asks “Nếu ghé Quy Nhơn thì sao?” from a Trip whose applied route does not include it | `explore_change`; current plan remains baseline; Quy Nhơn is transient; later turns use unchanged Trip unless a proposal is applied |
| `PM-03` | Traveler reviews one current pending route proposal | `validate_proposal`; exact proposal revision and affected-item fences; proposal effects are labeled pending |
| `PM-04` | Traveler asks privately while an owned Trip exists but is not selected | `unscoped_answer`; no Trip constraint, path, proposal, or private project metadata enters retrieval or persistence |
| `PM-05` | Proposal is applied while an answer runs | Old execution is fenced/discarded or safely refreshed; it cannot persist as current-plan output |
| `PM-06` | Pending proposal is dismissed or expires | Later current-plan retrieval uses unchanged applied Trip state |

## Canonical Trip Path And Route Resolution

| ID | Scenario | Expected |
|---|---|---|
| `RP-01` | Current Trip leg has an owner-confirmed exact path in the pinned registry | `authoritative_selected`; hard path applicability is permitted |
| `RP-02` | No selected path, but active coverage assertion proves complete OD alternatives | `authoritative_complete`; hard decisions use the complete asserted set |
| `RP-03` | Registry knows only some matching alternatives | `known_partial`; known matches are soft; absence cannot hard-exclude another route |
| `RP-04` | Multiple material alternatives resolve and would change guidance | `ambiguous_paths`; return path-independent guidance plus alternatives or one clarification; do not choose the popular path |
| `RP-05` | No supported OD path | `no_path`; route-wide claims disabled; exact place/general guidance plus limitation and next action |
| `RP-06` | Trip retains free-text labels after migration | Canonical references remain null; labels are query aids only and grant no confirmed-path authority |
| `RP-07` | Applied Trip path points to a retired or incompatible registry snapshot | `stale_selected_path`; stored meaning remains reviewable but grants no hard authority; only an owner-confirmed proposal refreshes it |
| `RP-08` | Card has an applicable place fact and off-path route fact | Place assertion cannot authorize the route fact; route contribution excluded |
| `RP-09` | Multi-leg card is applicable to leg 1 and off-route for leg 2 | Decisions persist per requirement/leg; leg 1 cannot satisfy leg 2 |

## Required-Need Coverage And Capacity

| ID | Scenario | Expected |
|---|---|---|
| `RN-01` | Broad question retrieves four cards that all cover food but omit a required route warning | Warning need remains uncovered and triggers verification/gap behavior; card count does not establish sufficiency |
| `RN-02` | Narrow question has one exact applicable card covering its only required need | Need is satisfied without count-based web fallback |
| `RN-03` | Prompt budget cannot retain every required contribution | Consequential requirements win; every dropped required need becomes explicit limitation/verification/clarification |
| `RN-04` | Candidate cap excludes an otherwise eligible must-include contribution | Stable pre-cap order and `eligible_but_cap_excluded` telemetry are recorded; critical cohort fails if the edge is required |
| `RN-05` | Selected contribution becomes stale before rendering | Final coverage is recomputed; stale contribution is omitted and the need becomes a safe gap before model call |
| `RN-06` | Off-scope high-prestige source resembles the question | It cannot satisfy or boost the requirement into the final set |
| `RN-07` | One card contains an applicable place fact and a stale/off-route warning fact | Two fact-level contribution decisions are created; only the applicable current fact may survive rendering |

## Web Scope And Freshness

| ID | Scenario | Expected |
|---|---|---|
| `WS-01` | Exact/reviewed web fact matches the required place/time and leg | External unverified contribution may be used with source, time, and verification guidance |
| `WS-02` | Web result mentions query destination in metadata but its fact concerns another route | Fact-specific scope decision is mismatched; it is excluded as a premise |
| `WS-03` | Web geography cannot resolve | Result remains a verification lead; required need is not satisfied |
| `WS-04` | Search provider fails or returns low-quality results | Gap remains; answer lowers certainty and gives a practical permitted verification action |
| `WS-05` | Recent warning says a road was closed at an earlier time | It may be reported as a recent warning but not as live closure/opening, navigation, traffic, or guaranteed-safety authority |
| `WS-06` | Same captured result is replayed under the same payload, registry, and resolver | Projection identity and decisions reproduce exactly; changed dependency creates a new projection rather than mutating history |
| `WS-07` | Query-builder privacy policy or fact-segmentation version changes | A new query/fact/projection identity is required; old decisions remain replayable and cannot be silently reused |

## Deletion And Ownership

| ID | Scenario | Expected |
|---|---|---|
| `DEL-01` | Delete an ordinary conversation that previously explored a Trip detour | Conversation-derived runs/context disappear; unrelated Trip plan and selected path remain unchanged |
| `DEL-02` | Delete a live Trip's primary conversation | Command replaces the pointer with an owned linked conversation or deletes the Trip; no orphan pointer remains |
| `DEL-03` | Delete a Trip Project | Structured plan, canonical route choice, snapshots, proposals, derived retrieval/context, and reconstructable diagnostics are invalidated |
| `DEL-04` | Inspect retained audit after deletion | Audit cannot reconstruct traveler question, answer, Trip state, path, or source content |

## Compatibility And Cutover

| ID | Scenario | Expected |
|---|---|---|
| `COMP-01` | Legacy broad query returns fewer than three cards but all required needs are satisfied | Legacy/shadow count telemetry may fire; `v6_active` does not call web solely for count |
| `COMP-02` | Broad query returns three or more cards but a required need is missing | Required-need gap controls v6 web/clarification behavior; count cannot suppress it |
| `COMP-03` | Shadow comparison runs | No traveler answer change, web/model call, prompt usage, or provenance write from shadow path |
| `COMP-04` | Evidence window or any critical safety cohort fails | No cutover or compatibility retirement |
| `COMP-05` | Approved cutover later regresses | Versioned read mode rolls back without destructive data/schema rollback |
| `COMP-06` | Physical legacy cleanup is requested while rollback still names legacy | Cleanup is rejected; a retained known-safe v6 policy must become the rollback target first |
| `COMP-07` | A shadow request is retried and later deleted | One paired execution retains exactly one authoritative and one shadow role; shadow has only a would-render manifest, and deletion invalidates the pair together |

## Trip Recommendation And Continue Boundaries

| ID | Scenario | Expected |
|---|---|---|
| `TP-01` | Traveler accepts an owner-bound Trip creation recommendation | Trip and primary conversation are created idempotently; extracted/chat facts do not become confirmed plan state without proposal apply |
| `TP-02` | Traveler declines creation recommendation | Decline fence persists for the exact context revision; no re-offer until material change or explicit save request |
| `TP-03` | Traveler continues an ordinary question in an owned Trip | URL scope changes to the existing primary conversation; ordinary transcript is not copied, merged, linked, or replayed into Trip state |
| `TP-04` | Traveler chooses a private answer instead of an offered Trip | No Trip constraint/path/proposal is loaded or persisted and URL scope remains unchanged |

## Persistent Chat-To-Trip Conversion

| ID | Scenario | Expected |
|---|---|---|
| `TC-01` | A useful unscoped answer completes with durable ready planning context | One owner-bound eligible opportunity projects a persistent `Chuyển thành chuyến đi` CTA |
| `TC-02` | Traveler keeps chatting without clicking the CTA | No decline is recorded; CTA remains while eligible and its current manifest advances on each material completed context revision |
| `TC-03` | CTA first appeared before the traveler added a return leg and changed lodging preferences, then traveler clicks | Command uses the latest eligible manifest containing the return leg and correctly scoped lodging values; the earlier manifest is not converted |
| `TC-04` | A newer reply makes a required value ambiguous or reopens a dependent deliverable | Opportunity is suspended or refreshed; click creates nothing until current context is eligible again |
| `TC-05` | Traveler explicitly dismisses the CTA | Exact material-context decline fence is recorded; merely hiding/navigating away/not clicking is not dismissal |
| `TC-06` | Valid conversion succeeds | One transaction creates exactly one Trip, separate primary conversation, and initial pending proposal; no transferred value is applied Trip state before owner Apply |
| `TC-07` | Inspect converted Trip and original chat | Raw transcript, assistant prose, prompts, provider payload, model reasoning, ambiguous values, and unresolved fields were not copied or linked |
| `TC-08` | Duplicate/concurrent click retries with the same idempotency key | Same destination and proposal identity replay; a different request digest with the key fails and no duplicate Trip/proposal exists |
| `TC-09` | Conversation changes or is deleted while conversion races | Stale manifest cannot commit; deletion invalidates open opportunity/manifest and no orphan Trip is created |
| `TC-10` | Traveler chooses `continueInTrip(...)` for an existing owned Trip | Only URL scope changes to its primary conversation; no current-chat context is imported and no proposal is created |
| `TC-11` | CTA is visible while a newer traveler turn is still processing | CTA is non-actionable until terminal context reduction finishes; conversion cannot omit that turn or use the older manifest |
| `TC-12` | Context is ready only through a bounded assumption or contains a field unsupported by the conversion policy | Assumption creates no proposal operation; unsupported value remains a visible gap, and opportunity is ineligible when no supported explicit operation remains |
| `TC-13` | Conversion policy is empty, over-limit, duplicates or conflicts on a field/scope, names an unknown field/operation, or uses an incompatible value schema | G0/startup validation rejects the policy; no opportunity/manifest from it becomes eligible or contributes release evidence |
| `TC-14` | Later completed sessions change dates and replace vehicle/direction at equal scope while adding a compatible destination-stay preference | Canonical projection orders all eligible claims, replaces only declared equal-scope fields, accumulates compatible scoped values, and suspends on unresolved contradiction |
| `TC-15` | Accept, dismiss, refresh, and delete race on one opportunity version | Same conversation/opportunity lock and CAS permit exactly one legal transition; dismissed/consumed/invalidated states never reactivate, and material change after dismissal creates a new opportunity ID |
| `TC-16` | A second tab clicks while the first tab has a newer unterminated AI Ask | Server projects visible-disabled and admission rejects conversion until the exact pending command/content revision terminalizes, without dismissing or suspending the durable opportunity |
| `TC-17` | Stored typed payload is missing, fails proposal schema, or differs from canonical serialization/digest | Opportunity is not actionable and conversion creates nothing; implementation cannot silently reproject different operations |
| `TC-18` | Accept first returns refresh-required, later succeeds, source chat is deleted, then destination is deleted | Refresh does not burn the key; success replays while destination exists after source deletion; destination deletion tombstones replay to `destination_deleted` without live IDs |
| `TC-19` | Context becomes ambiguous or insufficient, then a later clarification resolves it | Same opportunity moves eligible-to-suspended-to-eligible with a new manifest; no dismissal fence or new ID is created |
| `TC-20` | Policy/schema is withdrawn versus owner/conversation deletion or ownership/scope loss | Every cause emits its closed reason and invalidates; later supported reprojection may create a new ID only for policy/schema withdrawal, never for deleted/lost/incompatible ownership scope |

## Profile And Activation Validation

| ID | Scenario | Expected |
|---|---|---|
| `GATE-01` | Gate profile omits a mandatory metric or supplies a complete but weakened required `0/1` safety value | Profile validation fails and no evidence window/cutover may use it |
| `GATE-02` | Registry, runtime policy, parser, resolver, corpus, or code revision changes during a window | Existing window stops; evidence restarts under the new exact comparable tuple |
| `GATE-03` | Registry publication fails validation or projection build | Previous release remains active and no new path/coverage authority is visible |
| `GATE-04` | Two actors activate read policies from the same expected version | Exactly one CAS succeeds; the stale activation writes no policy/cutover change |
| `GATE-05` | Critical regression triggers rollback to a previously qualified runnable policy | Rollback CAS uses failing report/incident and authorized actor; it does not require a new passing report or approval |

## Production Journey Mapping

| Journey | Fixtures |
|---|---|
| `PJ-01` private question to durable Trip | `TC-01` through `TC-10`, then `PM-01` after the initial proposal is owner-applied |
| `PJ-02` current-plan answer | `PM-01`, `RP-01`, `RN-05` |
| `PJ-03` hypothetical detour | `PM-02`, `RP-04`, `PM-05` |
| `PJ-04` partial, ambiguous, or unsupported route | `RP-03`, `RP-04`, `RP-05` |
| `PJ-05` missing evidence or runtime capacity | `RN-01`, `RN-03`, `RN-04` |
| `PJ-06` changing real-world warning | `WS-04`, `WS-05` |
