---
title: 'Admin Review For Captured YouTube Evidence'
type: 'feature'
created: '2026-07-17'
status: 'in-review'
review_loop_iteration: 0
baseline_commit: '668c414'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `pnpm youtube:capture` saves bounded, operator-only video evidence, but the admin console has no route that lets an operator inspect that evidence and send the source through the established draft review and approval workflow. Captured YouTube sources therefore cannot be approved into traveler-eligible knowledge through the UI.

**Approach:** Add an admin-only YouTube capture queue and source-detail screen. The screens will present only a strictly parsed evidence projection and allow an eligible capture to enqueue the existing extract-only worker; cards then continue through the current draft review and approval flow.

## Boundaries & Constraints

**Always:** Authorize every YouTube capture read and extraction request server-side for admin/operator roles. Treat the persisted bounded evidence parser as authoritative, render a fixed typed projection rather than raw JSON, and expose only individually allowlisted safe metadata. Reuse the existing extraction job lock/deduplication and draft approval workflow. Keep Vietnamese-first copy and existing admin visual conventions.

**Ask First:** Adding a YouTube-specific review lifecycle table, supporting automatic approval or Extract & Approve All, changing the persisted capture payload, or allowing unparsed legacy payloads into the review UI.

**Never:** Render `raw_source_material.raw_text`, arbitrary `raw_metadata`, Gemini request/response payloads, prompts, credentials, or provider errors. Do not create cards directly from the UI, bypass the extraction worker, or make unreviewed cards retrievable.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Captured video | YouTube source has non-empty, valid bounded evidence and `gemini_youtube_url` metadata | Queue lists a compact safe summary; detail displays parsed evidence and permits draft extraction | N/A |
| Invalid capture artifact | Empty JSON, malformed JSON/evidence, unexpected capture method, or no evidence items | Source is omitted from queue and has no reviewable detail/action target | Detail is not found; no job is created |
| Existing extraction | A current extraction-prompt card is linked to the source | Detail links existing cards and does not offer duplicate extraction | Action redirects with a safe already-extracted status |
| Existing active job | Same source has queued/running extraction job | Detail shows in-progress state and suppresses duplicate submit | Action reports existing queued job safely |
| Hostile source ID | Submitted ID is non-YouTube or not a valid captured artifact | Server rejects it before enqueueing | Safe redirect/error; no provider call or job |
| Unauthorized reader | No session or traveler session | Server returns authorization failure before source data is read | Existing admin authorization boundary applies |

</frozen-after-approval>

## Code Map

- `src/features/knowledge/youtube-capture.ts` -- strict bounded evidence parser and allowlisted capture metadata.
- `src/features/knowledge/youtube-capture-review-admin.ts` -- new admin-only safe read models and extraction target validation.
- `src/features/knowledge/actions.ts` -- server form action that enqueues only validated YouTube sources in extract-only mode.
- `src/features/knowledge/extraction-jobs.ts` -- existing transactional enqueue and duplicate protection to reuse.
- `src/features/knowledge/facebook-capture-review-admin.ts` -- closest admin read-model and safe metadata pattern.
- `src/app/admin/knowledge/youtube-captures/page.tsx` -- new compact paginated capture queue.
- `src/app/admin/knowledge/youtube-captures/[sourceId]/page.tsx` -- evidence detail, card links, and extraction control.
- `src/app/admin/layout.tsx` -- protected admin navigation.
- `tests/youtube-capture-review-admin.test.ts` -- focused authorization, safety, rendering, and extraction tests.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/knowledge/youtube-capture.ts` -- export safe persisted-evidence parsing so every review path validates the same bounded artifact.
- [x] `src/features/knowledge/youtube-capture-review-admin.ts` -- add server-only, authorized queue/detail/target readers that query YouTube sources only, omit invalid artifacts, project safe metadata, and hydrate existing cards and active jobs.
- [x] `src/features/knowledge/actions.ts` -- add a YouTube-specific extraction form action that derives eligibility from the server target, uses `extract_only`, and redirects only with safe status information.
- [x] `src/app/admin/knowledge/youtube-captures/page.tsx` and `src/app/admin/knowledge/youtube-captures/[sourceId]/page.tsx` -- add Vietnamese queue and detail UI following Facebook capture layout but rendering typed evidence only.
- [x] `src/app/admin/layout.tsx` -- expose the protected Capture YouTube queue in the admin navigation.
- [x] `tests/youtube-capture-review-admin.test.ts` -- cover queue isolation, parsed-evidence safety, metadata redaction, authorization, existing-card/job behavior, action tampering, and rendered links.

**Acceptance Criteria:**
- Given a captured YouTube source with valid persisted evidence, when an operator opens the queue and detail route, then they can inspect category, claim, timestamp range, confidence, freshness, bounded excerpt, condition, safe source metadata, job status, and linked cards without raw payload exposure.
- Given an eligible detail has no linked extraction-version card or active job, when the operator requests extraction, then exactly the existing extract-only job is queued and the generated cards remain drafts requiring existing human approval.
- Given malformed, absent, tampered, non-YouTube, or empty evidence, when the queue, detail, or form action is requested, then it cannot expose raw material or enqueue extraction.
- Given an existing extraction-version card or active job, when the detail or action is reached, then duplicate extraction is blocked and the operator is directed to the existing cards or in-progress state.
- Given an unauthenticated or traveler request, when the queue, detail, or extraction action is called, then it fails at the admin authorization boundary before evidence is returned or a job is created.

## Design Notes

YouTube capture does not need Facebook's capture-review state machine: its artifact is already structured, bounded evidence. The queue is consequently source-ID based. The UI is a review handoff, not a trust promotion: it can only create `draft` cards through the current worker, and each draft must still be individually reviewed and approved under the established raw-leak, source, confidence, and freshness checks.

The database can contain manual or legacy rows, so capture-time sanitization is insufficient for display. The review read model must parse `rawText` using the strict capture parser and must select/project metadata keys one by one rather than returning an opaque JSON object.

## Verification

**Commands:**
- `pnpm test:run tests/youtube-capture-review-admin.test.ts` -- expected: authorization, projection, action, and rendering tests pass.
- `pnpm test:run tests/youtube-capture.test.ts tests/knowledge-extraction-worker.test.ts` -- expected: existing capture and extraction behavior remains green.
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: no TypeScript errors.
