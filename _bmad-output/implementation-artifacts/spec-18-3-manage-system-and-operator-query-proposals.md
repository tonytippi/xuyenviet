---
title: 'Manage system and operator query proposals'
type: 'feature'
created: '2026-08-07'
status: 'ready-for-dev'
baseline_revision: 'bbc752d'
review_loop_iteration: 4
followup_review_recommended: true
final_revision: null
context: []
warnings: []
---

## Auto Run Result

- Status: ready-for-dev
- Summary: Final AC1/AC5 closure findings are repaired without widening Story 18.3. Owner ports publish real bounded owner-owned aggregates; timed reads are abortable and late resolution cannot write; transformed legacy system proposals are disabled with no scheduling projection; and only operator-origin proposals support text edit.
- Approved command boundary: A system-origin proposal retains its system-derived text and target identity when an operator attempts text edit. It remains reprioritizable, pausable, and resumable. Origin remains immutable for every command.
- Evidence: `tests/youtube-discovery-foundation.integration.test.ts` proves a real Knowledge aggregate creates exactly one idempotent system proposal without private Knowledge text, rejects text edit for a system proposal while preserving its identity, and permits reprioritize, pause, and resume for that system proposal. `tests/youtube-discovery-execution.integration.test.ts` proves timeout abort and no late proposal write. `tests/story-18-3-clean-break.test.ts` proves the 0047 transformed legacy row has no anchor or due projection.
- Verification: Focused Vitest selection passed (4 files, 32 tests); complete `pnpm typecheck`, complete `pnpm build`, and `git diff --check` pass.
- Commit: pending repair-only commit.
