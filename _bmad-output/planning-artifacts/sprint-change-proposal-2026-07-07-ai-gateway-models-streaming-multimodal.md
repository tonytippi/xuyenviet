---
title: Sprint Change Proposal - AI Gateway Model Catalog, Streaming, And Multimodal Chat
status: approved
created: 2026-07-07
workflow: bmad-correct-course
change_scope: moderate
review_mode: batch
---

# Sprint Change Proposal - AI Gateway Model Catalog, Streaming, And Multimodal Chat

## 1. Issue Summary

### Trigger

After Epic 2 was completed and tested, the product owner identified missing AI Chat capabilities that should be addressed before the AI orchestration and retrieval epics harden around the current text-only, single-model behavior:

- XuyenViet needs to manage models callable through the OpenAI-compatible AI Gateway.
- Each gateway model needs at least the gateway model name plus input, output, and cache pricing.
- AI Chat needs streaming support.
- AI Chat needs image input support.
- Image output may be needed, but the MVP requirement is not yet confirmed.

### Core Problem

Epic 2 successfully shipped the first usable authenticated Vietnamese AI Ask loop, but it treated the AI Gateway model as a simple configured value and intentionally deferred streaming and multimodal behavior. That is acceptable for proving the initial chat loop, but it is not enough for the next implementation phase because upcoming retrieval, provenance, usage, and knowledge-intake stories will depend on stable model selection, cost metadata, usage accounting, and provider capability contracts.

Without correcting course now, later stories risk embedding assumptions that are expensive to undo:

- hard-coded model identifiers rather than managed gateway model records,
- incomplete cost accounting because pricing is not tied to model metadata,
- non-streaming response persistence patterns that conflict with responsive chat UX,
- text-only request contracts that cannot support traveler screenshots or operator image extraction cleanly,
- unclear handling of image output, which may accidentally expand MVP scope.

### Evidence

- PRD section 6.1 requires OpenAI-compatible AI Gateway-backed behavior and AI usage tracking, but does not define model catalog or pricing metadata.
- PRD section 6.2 already mentions image/screenshots for operator knowledge extraction, but AI Ask itself remains text-only in the requirements.
- Architecture AD-10 requires every model call to declare purpose, model, prompt version, input source bundle, and output schema expectation, but does not define a managed model registry or per-model pricing.
- Architecture AD-16 already allows streaming only after retrieval/search context and provenance inputs are assembled, but Epic 2 stories explicitly blocked streaming to keep the initial loop simple.
- Epic 2 retro notes that richer source bundle, provenance, cost, retrieval-decision, and model-evaluation behavior remain future work.
- `sprint-status.yaml` marks Epic 2 as done, so this should be handled as an explicit post-epic adjustment rather than silently reopening completed stories.

## 2. Impact Analysis

### Epic Impact

Epic 2: AI Ask Conversation Experience

- Epic 2 remains valid, but sprint status returns to in-progress because a new incomplete follow-up story is being added under Epic 2.
- Add Story 2.7 to introduce streaming-capable AI Ask and traveler image input without rewriting completed Epic 2 story files.
- Story 2.7 should preserve the existing fail-closed guarantees: unauthenticated/invalid submissions create no message, usage event, or provider call.

Epic 3: Chat Sessions And Trip Projects

- Minor downstream impact. Image attachments submitted in chat must be scoped to the owning conversation/session and later trip project when selected.
- Deletion stories 3.6 and 3.7 must cover attached image metadata/files and any image-derived retrievable content if added.

Epic 4: AI-Assisted Knowledge Intake And Approval

- Existing image/screenshot intake remains in scope.
- The AI Gateway model catalog should support extraction-capable and vision-capable model selection so operator image extraction does not depend on the same model as traveler chat.

Epic 5: Grounded Retrieval, Web Search, And Provenance

- Strong impact. Model management and pricing belong near AI orchestration, usage, and provenance.
- Add a new Story 5.0 or 5.10 for AI Gateway model catalog and pricing, preferably before Story 5.9 usage event standardization.
- Update Story 5.9 so usage events resolve model pricing from the catalog when configured and record cost estimates consistently.
- Streaming must remain gated behind context/source-bundle assembly and provenance ledger preparation.

Epic 6: Family-Aware Planning And Public MVP Quality Loop

- Minor impact. Evaluation records should include the model used and eventually support separate text-only vs image-input prompts if image chat is included in MVP evaluation.

### Story Impact

Stories requiring direct update or insertion:

- New Story 2.7: Stream AI Ask Responses And Accept Traveler Image Input.
- New Story 5.0 or 5.10: Manage AI Gateway Models And Pricing.
- Update Story 5.9: Record AI Usage Events to use model catalog pricing and cache-token metadata where available.
- Update Story 4.2: AI Extracts Knowledge Drafts From Source to select a vision-capable extraction model for image/screenshot inputs.
- Update Story 3.6 and 3.7 later during story creation to include deletion behavior for image attachments and image-derived content.

Completed Epic 2 story files should not be rewritten. Their completion notes remain historically accurate; the approved change is represented by new Story 2.7 and sprint-status reopening.

### Artifact Conflicts

PRD:

- Needs explicit requirements for AI Gateway model management and pricing metadata.
- Needs explicit streaming requirement for AI Ask responsiveness.
- Needs explicit image input support for AI Ask if this is now MVP scope.
- Needs image output classified as an open question or deferred unless the product owner confirms it is Must Have.

Architecture:

- Needs a model catalog contract owned by AI Orchestration or a small AI Model Config subdomain.
- Needs data contracts for `ai_gateway_models` or equivalent config-backed model records.
- Needs capability flags: text input, image input, image output, embeddings, extraction, evaluation, streaming, cache pricing support.
- Needs pricing units and effective dates so usage cost estimates are reproducible.
- Needs streaming persistence rules: partial tokens may stream to the UI, but the final assistant message and provenance remain the source of truth.
- Needs multimodal input handling rules: uploaded images are user-owned or operator-only according to surface, provider payloads are not stored blindly, and deletion behavior is defined before migration approval.

UX:

- AI Ask state patterns need streaming answer behavior instead of only pending/completed.
- Chat composer needs image attachment affordance and accessible upload/remove states.
- The source/provenance drawer should not imply image-derived facts are verified unless they pass the same source/provenance rules.
- Image output has no UX contract yet and should remain deferred/open until confirmed.

Secondary artifacts:

- `sprint-status.yaml` should receive new story entries only after proposal approval.
- Implementation readiness should be rerun after PRD/architecture/epics updates.
- Project context should eventually gain updated rules for model catalog, streaming, and image input if implementation standards change.

## 3. Recommended Approach

### Selected Path

Direct Adjustment with bounded backlog reorganization.

### Rationale

This is not a rollback. Epic 2 delivered the correct first loop: authenticated text chat, persistence, safe provider failure, structured Vietnamese answer formatting, conversation continuation, usage placeholders, and non-streaming responsiveness. The new requirements are best treated as follow-up infrastructure and UX capability before deeper orchestration work starts.

The change is moderate because it affects PRD, architecture, epics, UX, usage accounting, and future deletion behavior. It does not require redefining the product MVP or removing completed work.

### Recommended Sequencing

1. Update PRD, architecture, UX, and epics with this proposal's approved changes.
2. Add Story 2.7 before starting Epic 3 if streaming/image input is needed for near-term user testing, but implement Story 5.0 first unless a temporary hard-coded capability gate is explicitly approved.
3. Add model catalog story before full Epic 5 usage standardization, because Story 5.9 should depend on catalog pricing rather than inventing cost metadata inside usage events.
4. Keep image output deferred until a concrete traveler or operator workflow requires it.

### Effort Estimate

Medium.

- Model catalog and pricing: medium, because it adds schema/config management, validation, admin or seed path, and usage integration.
- Streaming: medium, because it changes request/response flow, UI state, abort/failure handling, and final persistence semantics.
- Image input: medium, because it touches upload validation, ownership, storage/deletion, Gateway payload construction, and privacy rules.
- Image output: unknown; defer unless confirmed.

### Risk Level

Medium.

Main risks:

- Cost drift if pricing metadata is wrong or lacks effective-date history.
- UI/provenance inconsistency if streamed text is treated as final before persistence succeeds.
- Privacy/data-retention risk if image uploads are not scoped, validated, and deleted with their owning chat/source.
- Scope creep if image output becomes generative media support without a clear MVP user journey.

## 4. Detailed Change Proposals

### PRD Changes

#### PRD Section 6.1: Must Have

Current relevant bullets:

```markdown
- AI Ask chat in Vietnamese.
- OpenAI-compatible AI Gateway-backed AI behavior. [ASSUMPTION: Gateway-routed model processing is acceptable for public MVP data processing under the project's privacy expectations; direct OpenAI API calls are not used.]
- AI usage tracking for authenticated AI requests, so future credit-based pricing can be introduced without changing the AI orchestration flow.
```

Proposed:

```markdown
- AI Ask chat in Vietnamese, with streaming assistant responses after required context/provenance inputs are assembled.
- AI Ask image input for authenticated users, so travelers can ask about relevant road-trip screenshots or photos when supported by the selected Gateway model.
- OpenAI-compatible AI Gateway-backed AI behavior. Direct OpenAI API calls are not used.
- AI Gateway model management for MVP model records, including gateway model name, supported capabilities, and input/output/cache pricing metadata used for usage cost estimation.
- AI usage tracking for authenticated AI requests, so future credit-based pricing can be introduced without changing the AI orchestration flow.
```

Rationale: makes streaming, image input, and model/pricing management explicit MVP scope instead of hidden implementation details.

#### PRD Section 6.3: Could Have

Add:

```markdown
- AI-generated image output for travel planning, only if a concrete MVP workflow and Gateway model capability are approved later.
```

Rationale: acknowledges the possibility without letting it expand current MVP scope accidentally.

#### PRD Section 8.1: AI Ask Functional Requirements

Add after FR-6:

```markdown
- FR-6A: The system shall stream AI Ask assistant responses when the selected Gateway model and orchestration path support streaming, but only after required context, source-bundle, and provenance inputs are assembled.
- FR-6B: The system shall allow authenticated users to submit supported image inputs with AI Ask messages when using an image-capable Gateway model.
- FR-6C: The system shall validate image inputs for size, type, ownership, and safety before any provider call, and invalid image submissions shall not create provider calls.
```

Rationale: preserves AD-16 and existing fail-closed guarantees while enabling streaming/multimodal chat.

#### PRD Section 8.7: Public MVP Operations

Add after FR-47:

```markdown
- FR-49: The system shall manage AI Gateway model records with gateway model name, intended purpose, supported input/output capabilities, active status, and input/output/cache pricing metadata.
- FR-50: The system shall use configured model pricing metadata to estimate AI usage cost when provider usage token metadata is available, without creating credit balance or billing behavior in MVP.
```

Rationale: separates model catalog/pricing from future credit billing.

#### PRD Section 10.5: Usage And Referral Readiness Contract

Add:

```markdown
- AI model pricing metadata is used for internal cost estimation only; MVP shall not expose credit balances, charge users, or block requests for insufficient funds.
- Usage cost estimates must identify the model pricing record or pricing version used when available.
- Cache pricing, if supported by the Gateway/provider, must be tracked separately from ordinary input and output pricing.
```

Rationale: cost accounting becomes auditable without becoming billing.

#### PRD Section 13: MVP Acceptance Criteria

Add:

```markdown
- AC-17: AI Ask can stream an assistant response after context/provenance preparation without treating partial streamed text as final persisted answer content.
- AC-18: An authenticated user can submit a supported image input with an AI Ask message, and unsupported or invalid images are rejected before provider calls.
- AC-19: Active AI Gateway models can be configured with model name, capability flags, and input/output/cache pricing metadata used by usage tracking.
```

Rationale: turns the change into testable acceptance criteria.

### Architecture Changes

#### Architecture AD-10: AI Gateway Access Is Adapter-Based And Source-Bundled

Add:

```markdown
Rule: AI Gateway model selection reads from a managed model catalog, not from scattered hard-coded model strings. Each active model record includes gateway model name, intended purposes, capability flags, pricing metadata, and effective date/version information.

Rule: Model capability flags must represent at least text input, image input, image output, embeddings, extraction, evaluation, streaming, and cache pricing support where applicable.

Rule: Usage cost estimates are derived from provider usage metadata plus the selected model pricing record when available. Missing pricing must not block safe answer generation, but it must be visible as missing-cost metadata in usage records.
```

Rationale: prevents cost/model drift across chat, extraction, embeddings, and evaluation.

#### Architecture AD-16: Streaming Starts After Context Assembly

Current:

```markdown
Rule: Long-running extraction and embedding may run as background tasks with status; user answers must not stream before the orchestrator knows which source categories were used.
```

Proposed addition:

```markdown
Rule: During streaming, partial assistant tokens are transient UI state. The final assistant message, retrieval decision, provenance rows, and usage events are persisted through the orchestrator; the UI must reconcile to persisted final content after completion.

Rule: If streaming fails before finalization, the app shows a recoverable failure state and must not create a misleading completed assistant message.
```

Rationale: preserves provenance and source-of-truth semantics while improving responsiveness.

#### Shared Data Contracts

Add to core persisted entities:

```markdown
- `ai_gateway_models`
```

Add model contract:

```markdown
AI Gateway model record minimum fields: gateway model name, display label, provider/gateway identifier when available, intended purposes, capability flags, active status, pricing currency, input unit price, output unit price, cache read/write unit prices when supported, pricing unit, effective timestamp or version, created/updated timestamps, and operator/admin audit metadata where applicable.

Usage events reference the model record or pricing version used for cost estimation when available. Usage events may also retain the raw gateway model name returned by the provider for reconciliation.
```

Rationale: pricing needs a stable source of truth independent of individual usage rows.

#### Multimodal Input Rule

Add:

```markdown
Rule: User-submitted AI Ask images are owned by the conversation/chat session or selected trip project context that accepted them. Operator-submitted knowledge images are owned by source/raw-source records. New image-bearing tables must define deletion behavior before migration approval.

Rule: Image inputs passed to the Gateway must be validated for allowed MIME type, size, ownership, and surface before provider calls. Raw provider payloads and image-derived notes must not be exposed outside their owning traveler/admin surface.
```

Rationale: aligns image input with existing privacy, raw material, and deletion constraints.

### UX Changes

#### EXPERIENCE.md Component Patterns

Update Chat composer behavior:

```markdown
| Chat composer | AI Ask | Accepts Vietnamese free text and supported image attachments. Empty/invalid submission blocked client-side and server-side. Unsupported image type/size is rejected before provider calls. Submit disabled while sending unless retrying failed draft. |
```

Add streaming answer behavior:

```markdown
| Streaming assistant answer | AI Ask | Shows incremental assistant text after context/source preparation starts generation. Partial text is visually pending and reconciles to the persisted final assistant message when complete. If streaming fails, show retry/recovery and do not imply the partial answer is saved as final. |
```

Rationale: makes streaming and image attachment states visible in UX contract.

#### EXPERIENCE.md State Patterns

Add:

```markdown
| Streaming AI response | AI Ask | Answer text may appear progressively after source/context preparation. Keep composer guarded, expose stop/retry only if implementation supports safe cancellation, and announce completion through `aria-live`. |
| Image attached to prompt | AI Ask | Show thumbnail/file row with remove action, type/size validation, and accessible label. Do not upload or submit unsupported images to the provider. |
| Image input rejected | AI Ask | Explain allowed file types/size and keep the user's text draft intact. No provider call is made. |
```

Rationale: covers mobile and accessibility behavior before implementation.

#### DESIGN.md Components

Add:

```markdown
- **Image attachment row** uses shadcn input/card primitives with compact thumbnail, filename or generic image label, size/status text, and a clear remove action. It must not look like an approved source chip.
- **Streaming answer state** uses subtle pending treatment and normal answer typography; avoid flashy typewriter effects that reduce readability or conflict with reduced-motion settings.
```

Rationale: preserves the established map-paper utility style without generic AI-chat effects.

### Epics And Story Changes

#### Requirements Inventory

Add:

```markdown
FR-49: The system shall manage AI Gateway model records with gateway model name, intended purpose, supported input/output capabilities, active status, and input/output/cache pricing metadata.

FR-50: The system shall use configured model pricing metadata to estimate AI usage cost when provider usage token metadata is available, without creating credit balance or billing behavior in MVP.
```

Update FR coverage map:

```markdown
FR-49: Epic 5 - AI Gateway model catalog and pricing
FR-50: Epic 5 - Usage cost estimation from model pricing
```

#### New Story 2.7: Stream AI Ask Responses And Accept Traveler Image Input

```markdown
As an authenticated traveler,
I want AI Ask to stream responses and accept relevant image inputs,
So that planning feels responsive and I can ask about screenshots or photos without leaving chat.

Acceptance Criteria:

Given an authenticated user submits a text-only AI Ask message
When the source/context preparation is complete and the selected Gateway model supports streaming
Then the assistant response streams progressively in the UI
And the final persisted assistant message remains the source of truth after completion.

Given streaming fails before completion
When the user is viewing the partial response
Then the app shows a recoverable failure state
And it does not create a misleading completed assistant message.

Given an authenticated user attaches a supported image to an AI Ask message
When the message is submitted
Then the system validates file type, size, ownership, and model image-input capability before any provider call
And the Gateway request includes the image only through the approved adapter path.

Given an image is unsupported, too large, unauthenticated, or attached to invalid text
When submission is attempted
Then the request is rejected before provider calls
And no message, usage event, or provider call is created unless the implementation explicitly supports text-only fallback and the user confirms it.

Given an image was accepted into a conversation
When the owning chat/session is deleted in later deletion stories
Then image metadata/files and image-derived retrievable content are removed or disabled from normal UI and retrieval according to the deletion contract.
```

Dependencies: after Story 2.6; before public testing that requires streaming or image chat. Story 5.0 should provide model capability metadata before Story 2.7 implementation unless a temporary hard-coded capability gate is explicitly approved for the story.

#### New Story 5.0: Manage AI Gateway Models And Pricing

```markdown
As a product owner/operator,
I want XuyenViet to manage callable AI Gateway models and pricing metadata,
So that AI orchestration can select capable models and estimate usage cost consistently.

Acceptance Criteria:

Given the app has AI Gateway access configured
When model records are seeded or managed
Then each active model has gateway model name, display label, intended purposes, capability flags, active status, pricing currency, input unit price, output unit price, cache pricing fields when supported, pricing unit, and effective timestamp or version.

Given AI orchestration prepares a model call
When it selects a model for chat, extraction, embeddings, evaluation, or image input
Then selection is constrained by configured purpose and capability flags
And direct hard-coded model strings are not scattered across feature code.

Given provider usage metadata is available
When a usage event is recorded
Then the Usage module can estimate cost from the selected model pricing record
And records missing pricing safely when a model has no configured price.

Given future billing is not part of MVP
When model pricing exists
Then the system does not show balances, charge users, enforce credits, or create payment obligations.
```

Recommended placement: before Story 5.9, or as the first Epic 5 story if the team wants cost/model contracts in place before retrieval orchestration expands.

#### Update Story 5.9: Record AI Usage Events

Add acceptance criteria:

```markdown
Given a usage event has provider token metadata and a selected model pricing record
When the event is persisted
Then the Usage module records estimated input, output, cache, and total cost fields where calculable
And references the model/pricing record or version used for the calculation.

Given provider cache token metadata is unavailable or the selected model has no cache pricing
When cost is estimated
Then missing cache cost is represented safely and does not block the user answer.
```

Rationale: makes pricing useful without turning it into a billing ledger.

#### Update Story 4.2: AI Extracts Knowledge Drafts From Source

Add acceptance criteria:

```markdown
Given the submitted source includes an image or screenshot
When AI extraction runs
Then the system uses a Gateway model configured for image input and extraction purpose
And extraction fails safely if no active capable model is configured.
```

Rationale: operator image intake should depend on the same model capability contract.

### Sprint Status Changes After Approval

After approval, update `sprint-status.yaml`:

```yaml
  2-7-stream-ai-ask-responses-and-accept-traveler-image-input: backlog
  5-0-manage-ai-gateway-models-and-pricing: backlog
```

If story ordering tooling does not support `5-0`, use `5-10-manage-ai-gateway-models-and-pricing` and mark it as a prerequisite for `5-9-record-ai-usage-events` during story creation.

## 5. Implementation Handoff

### Scope Classification

Moderate.

The change crosses planning artifacts and affects upcoming implementation sequencing, but it does not invalidate completed Epic 2 work or require a full MVP replan.

### Handoff Recipients

Product/Planning:

- Approve whether AI Ask image input is Must Have for MVP.
- Keep image output as Could Have/deferred unless a concrete workflow is approved.
- Update PRD with streaming, image input, model catalog, and pricing requirements.

Architecture:

- Update AD-10, AD-16, shared data contracts, and multimodal input/deletion rules.
- Decide whether model records are DB-managed, seed-managed, or admin-managed for MVP. Recommended: DB-backed seed/config records first; admin UI can wait unless operators need runtime changes.

UX:

- Update chat composer, streaming answer state, and image attachment/rejection states.
- Avoid image output UI until product confirms scope.

Developer agent later:

- Implement Story 2.7 only after the model capability path is clear.
- Implement model catalog before full usage cost estimation.
- Preserve existing no-side-effect guarantees for invalid/unauthenticated submissions.
- Keep partial streamed text transient until final persistence succeeds.

### Success Criteria

- Active Gateway models are managed in one catalog with capability and pricing metadata.
- Usage records can estimate input/output/cache cost when token metadata and pricing exist.
- AI Ask can stream without breaking final message/provenance persistence semantics.
- AI Ask can accept supported image inputs through the Gateway adapter with validation and ownership controls.
- Image output remains deferred unless explicitly approved.
- No billing, credit balance, payment, reward, or image-generation product surface is introduced by this change.

## 6. Checklist Results

- [x] 1.1 Triggering story identified: post-Epic 2 testing of AI Ask conversation experience revealed missing model management, streaming, and multimodal support.
- [x] 1.2 Core problem defined: text-only, single-config-model chat is insufficient for upcoming AI orchestration, usage costing, and multimodal needs.
- [x] 1.3 Evidence collected from PRD, architecture, epics, sprint status, and Epic 2 retro/spec patterns.
- [x] 2.1 Current epic evaluated: completed Epic 2 story files remain valid, while Epic 2 sprint status reopens because Story 2.7 is now added as backlog work.
- [x] 2.2 Epic-level changes identified for Epic 2, Epic 4, and Epic 5.
- [x] 2.3 Remaining epics reviewed: Epic 3 deletion behavior and Epic 6 evaluation metadata have minor downstream impacts.
- [x] 2.4 No new full epic required; new stories inside existing epic structure are sufficient.
- [x] 2.5 Epic order should adjust slightly: model catalog should precede full usage cost standardization, and Story 2.7 should run before user testing that requires streaming/image input.
- [x] 3.1 PRD impacts identified.
- [x] 3.2 Architecture impacts identified.
- [x] 3.3 UX impacts identified for composer, streaming state, attachment validation, and accessibility.
- [x] 3.4 Secondary artifacts identified: sprint status, readiness report, and project context may need updates after approval.
- [x] 4.1 Direct Adjustment viable; effort medium, risk medium.
- [N/A] 4.2 Rollback not viable or useful; completed Epic 2 work remains valid.
- [x] 4.3 MVP Review considered; MVP does not need reduction, but image output should remain deferred/open.
- [x] 4.4 Direct Adjustment selected.
- [x] 5.1 Issue summary created.
- [x] 5.2 Epic and artifact impacts documented.
- [x] 5.3 Path forward documented with sequencing.
- [x] 5.4 MVP impact and high-level action plan documented.
- [x] 5.5 Handoff plan established.
- [x] 6.1 Checklist completion reviewed.
- [x] 6.2 Proposal checked for consistency.
- [x] 6.3 Explicit approval obtained from user on 2026-07-07.
- [x] 6.4 Sprint status updated with Story 2.7 and Story 5.0 backlog entries; Epic 2 returned to in-progress because it now has an incomplete follow-up story.
- [x] 6.5 Next steps confirmed: create/validate Story 2.7 or Story 5.0 when ready for implementation.

## 7. Approval Request

Approve this proposal to update PRD, architecture, UX, epics, and sprint status with:

- managed AI Gateway model catalog and input/output/cache pricing,
- streaming AI Ask responses,
- AI Ask image input,
- usage cost estimation from model pricing,
- image output kept as Could Have/deferred until explicitly approved.

Approved by user on 2026-07-07.
