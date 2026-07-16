---
title: 'Deliver the Authenticated Desktop Shell'
type: 'feature'
created: '2026-07-16'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** The authenticated AI Ask route has the necessary server-authenticated, owner-scoped shell data and commands, but it is visually a floating warm-paper application card rather than the calm desktop traveler workspace required by Epic 7.

**Approach:** Convert only the authenticated desktop presentation to an edge-to-edge white/stone shell while retaining the existing server reads, ownership, URL selection, streaming, and Chat/Trips commands.

## Boundaries & Constraints

**Always:** Preserve server-authenticated, user-owned conversation and project reads; retain URL-owned selection, role-gated admin access, accessible active rows, existing streaming and attachment behavior, and the shared typed icon boundary. The empty state needs a 276px pale-stone sidebar, Vietnamese greeting, centered composer, four icon-led starters, and no blank inspector. Project scope must be visible in both navigation and the active chat context.

**Block If:** Deleting linked conversations cannot preserve owner scoping and cascading cleanup of their dependent records.

**Never:** Do not introduce new data loaders, persistence, command ownership, maps, client-derived selection, free-text entity inference, mobile selection redesign, streaming behavior changes, or a false representation of deletion behavior.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Empty workspace | Authenticated `/ai-ask` with no active answer | Server-loaded flat 276px sidebar with owned grouped resources and centered empty state; no inspector. | Existing protected-route redirect remains responsible for no session. |
| Active workspace | Owned active conversation, optionally project-scoped | Edge-to-edge viewport-height desktop shell with visible active rows and project context. | Existing server-safe stale, unauthorized, and mismatched selection handling remains unchanged. |
| Project deletion | Traveler confirms deletion of an owned project with linked conversations | Project, linked conversations, and stored project context are removed in one owner-scoped transaction. | The action returns an existing safe failure response without exposing private-resource existence. |

</intent-contract>

## Code Map

- `src/app/ai-ask/page.tsx` -- Server-authenticated AI Ask route and outer workspace shell styling.
- `src/features/ai/ai-ask-composer.tsx` -- Existing server-model-backed workspace, project scope, deletion UI, streaming, and desktop/mobile surfaces.
- `src/features/chat-trips/conversation-list.tsx` -- Owner-scoped conversation rows, selection, and deletion affordances.
- `src/features/chat-trips/trip-projects.ts` -- Authoritative owner-scoped project deletion behavior, including linked conversations.
- `tests/ai-ask-shell.test.ts` -- Shell and deletion-presentation regression coverage.
- `tests/trip-projects.test.ts` -- Authoritative deletion behavior coverage.
- `_bmad-output/planning-artifacts/epics.md` -- Story 7.3 acceptance statement requiring linked-chat deletion copy.

## Design Notes

The resolved deletion contract deletes the selected user's linked conversations before the project itself. The existing conversation foreign-key graph cascades messages, attachments, context, provenance, retrieval records, and feedback. AI usage records retain aggregate accounting but safely null their conversation/message references, consistent with existing conversation deletion behavior.

## Review Triage Log

### 2026-07-16 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 3
- defer: 0
- reject: 0
- addressed_findings:
  - Restored the keyboard-accessible sign-out action in the account surface.
  - Added the public privacy anchor used by the storage notice and account links.
  - Extended project-deletion regression coverage across the dependent conversation record graph and retained anonymized usage event.

## Auto Run Result

**Summary:** Delivered the authenticated desktop traveler workspace and resolved the project-deletion contract so a deleted project also deletes its linked conversations and dependent traveler data.

**Files changed:**
- `src/app/ai-ask/page.tsx` -- Removes the floating page card, preserves the protected server shell, and passes sign-out ownership to the workspace.
- `src/features/ai/ai-ask-composer.tsx` -- Renders the white/stone desktop workspace with a 276px sidebar, grouped projects, shared icons, storage notice, privacy link, conditional inspector, and truthful deletion UI.
- `src/features/chat-trips/conversation-list.tsx` -- Adapts conversation history to the flat sidebar and names affected chats in confirmation copy.
- `src/features/chat-trips/trip-projects.ts` -- Deletes owned linked conversations before deleting the project and records the resolved audit semantic.
- `src/app/page.tsx` -- Provides the linked privacy-information anchor.
- `tests/ai-ask-shell.test.ts` and `tests/trip-projects.test.ts` -- Cover the shell migration, confirmed deletion contract, and dependent-record cascade behavior.

**Verification:** `pnpm exec vitest run tests/ai-ask-shell.test.ts tests/trip-projects.test.ts tests/auth-gate.test.ts` passed (100 tests). `pnpm build`, `pnpm typecheck`, `pnpm lint`, and `git diff --check` passed.

**Residual risks:** Visual checks at desktop, tablet, mobile, 200% zoom, and reduced-motion preference remain manual.
