---
title: 'Add Discovery Mission Entry Link'
type: 'feature'
created: '2026-08-15'
status: 'done'
route: 'one-shot'
---

# Add Discovery Mission Entry Link

## Intent

**Problem:** The YouTube Discovery review landing page exposed Health but provided no visible route to Mission, where operators manage Discovery queries.

**Approach:** Add a Mission link beside the existing Health link, using the established Mission route and the existing header visual language.

## Suggested Review Order

- Adds an accessible Discovery navigation group with the Mission entry point.
  [`review.tsx:223`](../../../apps/admin/app/knowledge/youtube-discovery-review/review.tsx#L223)

- Guards both header destinations and their accessibility affordances against regression.
  [`admin-youtube-discovery-review-ui.test.ts:107`](../../../tests/admin-youtube-discovery-review-ui.test.ts#L107)
