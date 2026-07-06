---
title: 'Future Mobile Project Structure Boundary'
type: 'chore'
created: '2026-07-06'
status: 'done'
route: 'one-shot'
---

# Future Mobile Project Structure Boundary

## Intent

**Problem:** The project already expects a possible future mobile app, but that could cause agents to prematurely restructure the web MVP into a monorepo or shared-package workspace.

**Approach:** Document that the MVP remains a root-level Next.js modular monolith, and future mobile support must be treated as a later client-channel decision requiring explicit architecture or correct-course approval before any repo restructure.

## Suggested Review Order

- `../planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md:5` -- metadata now reflects the post-readiness architecture note date.
- `../planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md:44` -- AD-1 now blocks premature `apps/web`, workspace, shared-package, and deployable-shape changes for mobile.
- `../planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md:326` -- deferred items separate mobile channel from service decomposition.
- `../project-context.md:56` -- agent-facing rule mirrors the architecture constraint for day-to-day implementation.
