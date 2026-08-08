---
title: 'Manage system and operator query proposals'
type: 'feature'
created: '2026-08-07'
status: 'ready-for-dev'
baseline_revision: 'bbc752d'
review_loop_iteration: 3
followup_review_recommended: true
final_revision: null
context: []
warnings: []
---

## Auto Run Result

- Status: ready-for-dev
- Summary: The mandatory AC1 owner-port blocker is repaired. Knowledge and AI Ask each publish their own bounded aggregate port; the Worker binds both directly, and Discovery no longer owns database-created port readers.
- Verification: Targeted owner-port composition/isolation tests pass (2 files, 6 tests), complete `pnpm typecheck`, Worker build, and `git diff --check` pass. Owners without a supported safe aggregate signal return explicit bounded `available` empty through their own port; no permanent Worker fallback is used.
- Commit: repair-only `fix(discovery): bind owner aggregate ports`.
