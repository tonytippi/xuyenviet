---
title: Story 14.2 Atomic Traveler Direct-API Cutover
date: 2026-08-03
project: xuyenviet
status: approved
mode: direct-user-decision
change_scope: major
supersedes:
  - Story 14.2 command deferral to Story 14.3
---

# Sprint Change Proposal: Story 14.2 Atomic Traveler Direct-API Cutover

## Issue Summary

The direct AI Ask and shell-read implementation cannot retain the existing traveler command controls without retaining Auth.js/root server actions as a second authenticated domain transport owner. Removing those controls regresses traveler planning behavior.

## Approved Decision

Tony approved a clean development cutover: retire Auth.js completely for traveler web in this slice and migrate all traveler commands required by the AI Ask shell to direct Nest APIs. Root `/admin` and the independently deployed `apps/admin` identity/BFF paths are not traveler Auth.js and remain out of scope.

## Scope Change

Story 14.2 now owns the direct browser-session APIs and UI clients for traveler conversation/trip creation and deletion, proposal apply/dismiss including annotation-bound actions, answer usefulness feedback, and UI-exposed referral attribution. Nest OAuth must persist the validated referral first touch without Auth.js events. The Story also owns a development same-origin routing mechanism for relative `/v1/*` and `/auth/*` requests that only forwards transport and has no domain/auth behavior.

## Invariants

- Nest remains the sole traveler OAuth, opaque-session, CSRF, principal, read, and command owner.
- Browser calls remain relative, cookie-authenticated direct API requests; no BFF credential, route handler, server action, direct database browser owner, fallback, selector, or dual writer remains.
- Existing owner-scoped deletion, proposal lock/fence/expiry/audit/history, annotation binding, and feedback semantics must be preserved through extracted domain/database ports and Nest controllers.
- Root admin and `apps/admin` behavior remain unchanged. Final non-traveler Auth.js/BFF inventory retirement remains Story 14.5.
- Deployment ingress, staging evidence, migration-before-traffic, rollback, and launch evidence remain Story 14.6. The local forwarding rule is development transport support, not that evidence.

## Acceptance

1. Traveler `/ai-ask` retains every currently rendered command and workspace behavior through owner-scoped direct Nest APIs and browser-session CSRF admission.
2. Traveler sign-in, referral first touch, session expiry, and sign-out use Nest only; no traveler runtime path calls Auth.js or a root domain server action.
3. Root traveler Auth.js handlers/config/dependencies are removed only after source and integration inventory proves no traveler caller remains; root admin and `apps/admin` paths are preserved.
4. Relative `/v1/*` and `/auth/*` work in development via transport-only same-origin forwarding, while public deployment proof remains deferred.
5. The direct stream/shell review repairs are completed: stream sequencing/terminal validation, bounded optional enrichment, history project matching, shell message bounds, logout privacy, and query parameter validation.

## Handoff

This is a major, approved Story 14.2 scope correction. Re-derive and implement the replacement Story 14.2 spec; do not continue the blocked read-only contract.
