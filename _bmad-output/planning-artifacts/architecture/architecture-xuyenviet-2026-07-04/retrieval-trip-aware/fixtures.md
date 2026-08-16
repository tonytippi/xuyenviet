---
title: Retrieval And Trip-Aware Minimal Fixtures
status: final
updated: 2026-08-16
source_spine: ../ARCHITECTURE-SPINE.md
---

# Retrieval And Trip-Aware Minimal Fixtures

These fixtures cover traveler-visible boundaries without prescribing a generic engine.
Implementation may add focused cases but must not add persistence or infrastructure only
to model the fixture catalog.

## Clarification

| ID | Scenario | Expected |
|---|---|---|
| `CLAR-01` | “Lịch trình 7 ngày Hà Nội - Đà Nẵng” lacks return intent, vehicle, and party | Persist a collecting session and ask one material question; no main answer |
| `CLAR-02` | Traveler replies “Hai vợ chồng, đi ô tô” | Preserve party/vehicle and ask only the next missing return-intent question |
| `CLAR-03` | Traveler confirms a return to Hà Nội | Session becomes ready and retrieval uses the explicit round-trip scope |
| `CLAR-04` | Applied Trip already supplies vehicle/party | Do not ask those values again; do not copy them into chat-owned applied state |
| `CLAR-05` | Traveler contradicts a same-scope value | Mark that slot missing/ambiguous and ask one correction; do not choose by recency |
| `CLAR-06` | Traveler changes intent | Supersede the old session and start the new intent without carrying incompatible slots |
| `CLAR-07` | Extraction fails or returns stale output | Persist safe retry guidance and Usage once; do not enter retrieval or overwrite newer state |
| `CLAR-08` | Conversation is deleted | Its planning session disappears and stale extraction cannot recreate it |

## Planning Modes

| ID | Scenario | Expected |
|---|---|---|
| `PM-01` | Ask about the selected Trip | `current_plan`; exact applied snapshot only |
| `PM-02` | Ask “Nếu ghé Quy Nhơn thì sao?” | `explore_change`; applied Trip remains unchanged |
| `PM-03` | Review the current pending proposal | `validate_proposal`; effects stay pending |
| `PM-04` | Ask privately with no selected Trip | `unscoped_answer`; no private Trip data enters retrieval |
| `PM-05` | Applied Trip changes while answering | Discard or refresh stale output |
| `PM-06` | Pending proposal is dismissed | Later current-plan answers use unchanged applied state |
| `PM-07` | Owner applies a proposal then asks again | Next answer pins the new applied Trip version |

## Route Authority

| ID | Scenario | Expected |
|---|---|---|
| `RP-01` | Leg has an owner-confirmed supported path | Resolve `selected`; hard path applicability is allowed |
| `RP-02` | Static manifest proves complete alternatives for the endpoints | Resolve `complete`; asserted alternatives may support hard decisions |
| `RP-03` | Static manifest covers only some alternatives | Resolve `partial`; absence cannot exclude other routes |
| `RP-04` | Several material alternatives match | Resolve `ambiguous`; show alternatives or ask one question |
| `RP-05` | Endpoints are unsupported | Resolve `unsupported`; give bounded general guidance and limitation |
| `RP-06` | Historical leg contains only free-text labels | Labels are query aids and grant no durable path authority |
| `RP-07` | Stored path is absent from the current static manifest | Resolve `stale`; require owner-confirmed refresh |
| `RP-08` | Owner applies set-path then clear-path | Both operations advance existing Trip/item versions atomically and survive reopen |

## Required-Need Retrieval

| ID | Scenario | Expected |
|---|---|---|
| `RN-01` | Four cards cover food but omit a required route warning | Warning stays missing and triggers safe gap behavior |
| `RN-02` | One applicable card covers the only required need | Need is satisfied without count-only web fallback |
| `RN-03` | Prompt capacity cannot retain every required contribution | Consequential needs win; dropped required needs become explicit gaps |
| `RN-04` | Applicable evidence concerns another leg | It cannot satisfy the current leg's need |
| `RN-05` | Selected evidence becomes stale before rendering | Omit it and recompute the need outcome before generation |
| `RN-06` | Source metadata resembles the query but its fact is off-scope | Metadata cannot boost or authorize the fact |

## Web Verification

| ID | Scenario | Expected |
|---|---|---|
| `WS-01` | A changing need has an exact place/time web fact | Use it as external unverified evidence with source/time guidance |
| `WS-02` | Result metadata names the destination but the fact concerns another route | Exclude it as a premise |
| `WS-03` | Fact scope is unresolved | Keep it only as a verification lead; need remains uncovered |
| `WS-04` | Provider fails or results are low quality | Preserve the gap and give a practical verification action |
| `WS-05` | Recent article describes an earlier closure | Do not describe it as live traffic, navigation, or current closure |

## Chat-To-Trip Conversion

| ID | Scenario | Expected |
|---|---|---|
| `TC-01` | Completed unscoped answer has a supported explicit value | Current recommendation becomes eligible |
| `TC-02` | Context is ambiguous, incomplete, stale, or assumption-only | Recommendation is invalidated/ineligible |
| `TC-03` | Traveler does not click | No dismissal or mutation occurs |
| `TC-04` | Traveler explicitly dismisses | Existing recommendation becomes dismissed |
| `TC-05` | Traveler accepts eligible context | One Trip, primary conversation, and pending proposal are created atomically |
| `TC-06` | Same idempotency key retries | Return the same destination/proposal; create no duplicate |
| `TC-07` | Conversion is inspected before Apply | No transcript/provider content was copied and no Trip value is applied |
| `TC-08` | Accept races deletion or newer context | Existing owner/version fences allow one legal result and reject stale conversion |

## Deletion

| ID | Scenario | Expected |
|---|---|---|
| `DEL-01` | Delete an ordinary conversation | Its session, snapshots, provenance, and recommendation disappear; unrelated Trip remains |
| `DEL-02` | Delete a primary Trip conversation | Existing command replaces the pointer or deletes the Trip; no orphan remains |
| `DEL-03` | Delete a Trip | Its plan, path, proposal, and derived planning data disappear |
| `DEL-04` | Inspect retained audit | It cannot reconstruct traveler text, answer, Trip state, route, or source content |

## Card-Count And Clean-Break Verification

| ID | Scenario | Expected |
|---|---|---|
| `COMP-01` | Fewer than three cards satisfy every required need | No web call occurs solely to increase count |
| `COMP-02` | Three or more cards omit a required need | The gap still controls clarification or web verification |
| `CLEAN-01` | Target is not explicitly disposable | Reset/migration is refused and implementation stops |
| `CLEAN-02` | Target is disposable and migration `0073` runs | Exactly one Epic 21 table is added; no rollout-control schema appears |
| `CLEAN-03` | Active code/config/tests/runbooks are scanned | No count-decision branch or rollout-control authority remains |
| `CLEAN-04` | Any critical test/build check fails | Deployment is blocked; there is no legacy runtime fallback |

## Journey Mapping

| Journey | Fixtures |
|---|---|
| Private chat to reviewable Trip | `CLAR-01`–`CLAR-03`, `TC-01`, `TC-05`, `TC-07` |
| Current-plan answer | `PM-01`, `RP-01`, `RN-05` |
| Hypothetical detour | `PM-02`, `RP-04`, `PM-05` |
| Partial or unsupported route | `RP-03`–`RP-05` |
| Missing evidence | `RN-01`, `RN-03`, `WS-04` |
| Changing road warning | `WS-01`, `WS-05` |
