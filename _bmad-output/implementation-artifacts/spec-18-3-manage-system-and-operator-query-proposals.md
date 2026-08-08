---
title: 'Manage system and operator query proposals'
type: 'feature'
created: '2026-08-07'
status: 'done'
baseline_revision: 'bbc752d'
review_loop_iteration: 7
followup_review_recommended: false
final_revision: null
context: []
warnings: []
---

## Auto Run Result

- Status: done
- Summary: Story 18.3 is complete on the verified working tree. Migration 0047 is an unapplied schema-only clean break. Owner ports are bounded, owner-owned, version-fenced, and deterministic before their 100-signal limit; AI Ask demand is thresholded by distinct travelers. Policy, planning, operator commands, and due-run lifecycle share policy-first lock ordering, and paused proposals cannot be claimed, completed, or retried.
- Approved command boundary: A system-origin proposal retains its system-derived text and target identity when an operator attempts text edit. It remains reprioritizable, pausable, and resumable. Origin remains immutable for every command.
- Evidence: `tests/youtube-discovery-foundation.integration.test.ts` covers owner aggregate conversion, stale-version exclusion, pre-limit eligibility, deterministic priority ordering, cadence transitions, scheduler batching, and operator commands. `tests/youtube-discovery-execution.integration.test.ts` covers timed owner reads, planning fencing, policy transitions, and paused proposal run fencing. `tests/story-18-3-clean-break.test.ts` proves migration 0047 contains no legacy proposal data rewrite.
- Verification: Focused integration selection passed (4 files, 51 tests); focused unit selection passed (4 files, 29 tests); complete `pnpm typecheck` and `git diff --check` pass. Final independent Blind Hunter, Edge Case Hunter, and Acceptance Auditor reviews found no actionable findings.
- Commit: not created; verified implementation is in the current working tree.
