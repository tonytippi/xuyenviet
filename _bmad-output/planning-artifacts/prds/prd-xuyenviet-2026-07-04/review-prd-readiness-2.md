# PRD Readiness Re-Review - XuyenViet AI Travel Information MVP

- **PRD:** `/home/sonnh/projects/xuyenviet/_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md`
- **Addendum:** `/home/sonnh/projects/xuyenviet/_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/addendum.md`
- **Review focus:** only whether blockers remain before proceeding to UX, architecture, and epics
- **Prior review compared:** `review-prd-readiness.md`
- **Verdict:** Not fully ready. The update removed several former blockers, but one critical blocker and four high blockers remain.

## Overall Verdict

The PRD is materially improved and now has a clearer MVP surface, sharper scope, concrete first-beta card count, private-beta allowlist assumption, source/confidence requirements, and top-level acceptance criteria. It is close to downstream readiness.

However, it should not yet be treated as the final input for UX, architecture, or epics because several remaining product contracts are still unresolved or internally inconsistent. These are not just implementation details. If downstream work starts now, UX would need to invent the source/privacy experience, architecture would need to guess deletion/provider/source-audit constraints, and epics would encode assumptions around memory, search, source display, and beta evaluation.

Exploratory UX and architecture option framing can proceed, but committed UX specs, architecture spine, and epics should wait until the critical/high items below are resolved or explicitly converted into bounded architecture spikes with decision deadlines.

## Resolved Since Prior Review

- **MVP product surface clarified:** AI Ask is now explicitly the single public product surface for MVP.
- **Google Login and private beta mechanism narrowed:** PRD now assumes a simple email allowlist with Google Login.
- **Minimum knowledge-card count added:** 100 approved knowledge cards is now required before first beta evaluation.
- **Core answer format defined:** answers must include plan/options, rationale, practical tips, warnings, sources, uncertainty notes, and next steps.
- **Source/trust requirements improved:** web search facts must be labeled external/unverified; official/provider pages preferred; Facebook content not treated as official unless from identifiable official/provider page.
- **Top-level MVP acceptance criteria added:** AC-1 through AC-12 now provide a usable starting gate.
- **Success criteria improved:** private beta usefulness now has a 7/10 user threshold and generic-ChatGPT counter-metric.

These changes reduce the blocker count substantially, but do not fully close readiness.

## Critical Blockers

### 1. Persistent memory privacy contract is still unresolved

**Severity:** Critical  
**Locations:** PRD §6.1 lines 71-72, §8.2 FR-9 to FR-16, §9 NFR-2, §13 OQ-3; Addendum §25 lines 27-29

The PRD now adds basic memory privacy controls: consent notice, chat-based correction, deletion request path, and clear labeling that trip preferences are stored. This is a strong improvement, but it still does not define the actual privacy contract required for downstream work.

The blocker is not the absence of a full legal policy. The blocker is that the product contract for persistent memory remains ambiguous:

- What exact memory categories may be stored versus excluded.
- Whether memory is saved automatically after chat extraction or requires user confirmation.
- Whether users can inspect remembered facts, or only correct them through chat.
- What deletion means: memory only, conversation history, derived embeddings, operator logs, or all related records.
- Whether conversation transcripts are retained and for how long.
- What OpenAI processing constraints apply to private beta data.
- Whether child-related travel facts require stricter handling than general preferences.

This blocks architecture because data modeling, retention, deletion propagation, prompt-context assembly, embeddings, logging, and provider configuration depend on these rules. It blocks UX because the consent notice, correction path, deletion request, and memory visibility cannot be designed safely without the contract. It blocks epics because memory stories cannot have reliable done criteria.

**Required resolution before formal downstream handoff:**

- Add a short MVP memory/privacy contract section to the PRD.
- Define allowed memory categories and explicitly excluded sensitive data.
- Define save behavior: automatic extraction, user confirmation, or hybrid.
- Define MVP correction and deletion behavior in observable terms.
- Define retention expectations for memory and conversations, even if temporary for private beta.
- Confirm acceptable OpenAI/private beta processing constraints or mark an architecture spike with a decision deadline before implementation epics.

## High Blockers

### 2. Source display and confidence model remain UX/architecture-blocking

**Severity:** High  
**Locations:** PRD §6.1 lines 68-69, §7 UJ-1 line 100, §8.3 FR-18/FR-26, §8.5 FR-32 to FR-37, §12 AC-4/AC-5, §14 OQ-2; Addendum §25 line 31

The updated PRD requires source and confidence display, provenance categories, uncertainty notes, confidence labels, freshness flags, and external/unverified labeling. But it still does not define the minimum user-facing display contract.

Open question OQ-2 explicitly asks whether users see full source URLs, summarized labels, or both. The confidence taxonomy is also still deferred in the addendum even though FR-26 requires labels such as unverified, community, curated, partner, or official.

This blocks UX because answer layout, expandable source details, inline citations, confidence chips, and uncertainty language depend on source granularity. It blocks architecture because the audit/provenance model differs significantly depending on whether the system tracks source influence per answer, per section, per claim, per card, or per retrieved passage. It blocks epics because AC-4 and AC-5 are not testable enough without a display minimum.

**Required resolution before formal downstream handoff:**

- Define the MVP source display minimum: source title/label, source type, direct URL when available, collected/checked date, confidence, and freshness flag, or a smaller explicit set.
- Define where source details appear: inline, end-of-answer, expandable, or separate details panel.
- Define what confidence applies to: card, source, claim, answer section, or full answer.
- Finalize initial confidence labels or explicitly give architecture/UX a fixed provisional taxonomy.
- Add one acceptance criterion that makes source/confidence display testable.

### 3. Web search fallback is mandatory but provider and trigger rules are still not bounded enough

**Severity:** High  
**Locations:** PRD §6.1 line 68, §8.5 FR-29 to FR-37, §14 OQ-1/OQ-4; Addendum §8 lines 10-11 and §25 line 27

The PRD improves trust rules for web search by requiring official/provider preference and external/unverified labeling. But web search fallback is still a Must Have while the provider/mechanism is open and the trigger rules are broad: missing, sparse, or freshness-sensitive information.

Choosing the exact provider can be an architecture decision, but the PRD needs enough product constraints for architecture to decide correctly. Currently it does not define required capabilities such as citation availability, freshness metadata, Vietnamese search quality, official-source preference, caching expectations, failure behavior, or source count. It also does not define what qualifies as sparse enough to trigger web search.

This blocks architecture because provider selection, cost/latency design, citation capture, caching, and fallback behavior depend on those constraints. It blocks epics because retrieval/search stories cannot be accepted if the trigger and failure behavior are undefined.

**Required resolution before formal downstream handoff:**

- Either select the MVP web search provider/mechanism, or add a bounded architecture spike with decision criteria and deadline.
- Define minimum provider capabilities: retrievable URL/title/snippet, Vietnamese support, official-source preference, and acceptable latency/cost envelope if known.
- Define fallback triggers in observable terms, including missing, sparse, freshness-sensitive, and conflicting knowledge cases.
- Define failure behavior when search is unavailable or low-confidence.

### 4. Success criteria are improved but still insufficient as an AI quality gate

**Severity:** High  
**Locations:** PRD §11 SC-1 to SC-6, §12 AC-2 to AC-6/AC-11/AC-12

The updated PRD now has useful numeric beta targets, especially 7 of 10 users rating the magic-moment answer 7/10 or higher and no more than 2 of 10 saying the answer feels no better than generic ChatGPT. This resolves the prior complete subjectivity problem.

However, the MVP thesis depends on grounded AI quality, and the current success criteria still lack a concrete evaluation rubric. Terms such as useful, practical local tips, source/confidence notes, approved knowledge cards influence answers, and no better than generic ChatGPT remain open to interpretation.

This blocks epics and QA because story acceptance will need to define answer quality after the fact. It also affects architecture because retrieval/audit investments depend on how grounding quality is measured.

**Required resolution before formal downstream handoff:**

- Add a short beta answer-quality rubric with scoring dimensions.
- Include minimum dimensions for user-context use, practical specificity, source grounding, uncertainty handling, family-awareness when relevant, and Vietnamese clarity.
- Define a small evaluation prompt set beyond the magic-moment question, including sparse-data and freshness-sensitive cases.
- Add at least one counter-metric for hallucinated unsupported claims or stale/freshness-sensitive misuse.

### 5. Addendum conflicts with updated PRD and can mislead downstream agents

**Severity:** High  
**Locations:** Addendum §25 lines 27-31 versus PRD §8.4 FR-28, §8.7 FR-42, §8.3 FR-26, §14 OQ-1 to OQ-4

The addendum still lists several decisions as deferred even though the updated PRD appears to resolve or partially resolve them:

- Beta access mechanism is deferred in addendum, while PRD assumes a simple email allowlist with Google Login.
- Minimum card count is deferred in addendum, while PRD requires 100 approved knowledge cards.
- Confidence label taxonomy is deferred in addendum, while PRD gives example labels but still says exact names can be refined.
- Privacy and retention rules remain deferred and are still a true blocker.
- Exact web search provider remains deferred and is still open.

This blocks downstream readiness because BMad downstream workflows will read both files. Conflicts between PRD and addendum create avoidable ambiguity about which decisions are final, provisional, or still open.

**Required resolution before formal downstream handoff:**

- Update addendum deferred decisions to match the current PRD.
- Split deferred decisions into `Resolved`, `Provisional Assumption`, and `Still Open`.
- Remove minimum card count and beta access from deferred list if they are accepted as PRD decisions.
- Keep privacy/retention, web search provider, source display, and confidence taxonomy as open only if the PRD also marks them as open with owners/deadlines.

## Non-Blocking But Should Fix Soon

- NFR-1 still says responsiveness target will be defined after architecture spikes. This can proceed if architecture owns latency target definition before implementation epics.
- User journeys are still generic and unnamed. This does not block architecture, but UX would benefit from named beta traveler scenarios.
- Knowledge-card coverage is only defined by total count and broad categories, not route-segment distribution. This can be refined during epics if the 100-card first-beta requirement remains accepted.
- Should Have extraction from images/screenshots may expand scope. It should be marked beta stretch or core operator flow before sprint planning, but it does not block UX/architecture.

## Minimum Fix Set Before Proceeding

1. Add MVP memory/privacy contract: categories, consent/save behavior, correction, deletion, retention, OpenAI constraints.
2. Define MVP source/confidence display contract and make AC-4/AC-5 testable.
3. Bound web search fallback with provider decision or architecture spike criteria, trigger rules, and failure behavior.
4. Add a compact beta answer-quality rubric and evaluation prompt set.
5. Reconcile addendum deferred decisions with the updated PRD.

## Final Readiness Call

Do not proceed to formal UX specs, architecture spine, or epics yet. The PRD is close, but the remaining blockers are exactly the kind that downstream workflows would otherwise resolve inconsistently.

Once the minimum fix set is applied, UX and architecture can proceed in parallel. Epics should follow after those product contracts are stable.

## Unresolved Questions

- What exact memory/privacy contract applies to private beta user memory and conversations?
- What is the MVP source/confidence display model?
- Which web search provider/mechanism will be used, or what architecture spike will decide it?
- What rubric defines a good enough AI Ask answer beyond user usefulness rating?
- Which addendum deferred decisions are now resolved versus still open?
