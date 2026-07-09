# Web Search Fallback Quality Report

Date: 2026-07-09

Story: 5.8 Validate Web Search Fallback Quality

## Scope

This report validates the web-search fallback quality seam with deterministic fixtures instead of live Tavily calls. The validation covers Vietnamese corridor-style queries, required metadata, official/provider preference, community/repost safety, spoofed official claims, operational risk, and provider-independent fallback behavior.

## Fixture Findings

The evaluator covers these representative MVP query classes:

- Hanoi to HCMC road corridor route information.
- Hue ticket/pricing information.
- Ferry or schedule information.
- Hotel availability information.
- Weather or road-condition freshness-sensitive information.

For each query, the evaluator records title, URL, snippet/content availability, checked-date availability, provider score or ranking signal availability, usable Vietnamese-source count, source-type counts, and metadata gaps. Missing metadata lowers the deterministic score and appears in query notes.

## Source Preference And Safety

Official and provider-looking results are preferred only through normalized source metadata such as `sourceType: "official"` or `sourceType: "provider"`. Community, Facebook-style, reposted, or unattributed sources are flagged and are not treated as official. Spoofed official claims in titles or URLs are flagged when the normalized source metadata does not identify the source as official/provider.

This preserves the Story 5.7 trust boundary: web search remains external and unverified even when a result appears official or provider-like.

## Operational Risks

Tavily remains the provisional seed provider for MVP fallback validation. The key operational assumptions are:

- Normal CI and test runs must not require a live Tavily API key.
- Missing API key, timeout, provider error, invalid response, and low-quality result paths remain safe warning-only fallback behavior.
- Pricing and rate limits must be monitored before production scale because high travel-planning demand could reduce freshness coverage or increase operating cost.
- Runtime answer grounding, source display, confidence labels, and provenance remain provider-independent and must not depend on Tavily-specific payload fields.

## MVP Recommendation

Use Tavily as the MVP web-search fallback behind the existing adapter only if results continue to be labeled `unverified`, provider failures remain non-blocking, cost/rate-limit monitoring is added before scale, and official/provider preference is treated as validation criteria rather than approved XuyenViet knowledge.

If live provider quality degrades or cost/rate-limit risk becomes unacceptable, keep the existing warning-only fallback path and answer that current details cannot be verified rather than inventing freshness-sensitive travel facts.

## Verification

Targeted validation command:

```bash
pnpm test:run tests/web-search-quality.test.ts tests/web-search-adapter.test.ts
```

Expected result: deterministic quality evaluator tests and existing web-search adapter regressions pass without live provider calls.
