# Epic 21 Story 21.4 Approved Minor Course Correction

**Date:** 2026-08-17
**Decision:** Approved by product owner
**Classification:** Minor course correction

## Scope

Reserve exactly `drizzle/migrations/0074_add_trip_plan_item_canonical_route_path_id.sql` for Story 21.4. It adds only nullable `canonical_route_path_id` to existing `trip_plan_items`.

`0073_clean_break_trip_aware_planning.sql` remains final for Story 21.1 and must not be amended. The route manifest remains static and code-owned: Apply validates its ID, clear sets the stored value to `null`, and a stored ID absent from the manifest resolves `stale`.

## Rationale

Story 21.4 must retain owner-confirmed canonical route authority across reopening. Existing Trip-leg storage has no safe canonical path reference, and labels, proposal JSON, or other side channels cannot become authority.

## Limits

No other column, table, backfill, manifest persistence, worker, service, queue, flag, endpoint, external dependency, or application implementation scope is approved by this correction.
