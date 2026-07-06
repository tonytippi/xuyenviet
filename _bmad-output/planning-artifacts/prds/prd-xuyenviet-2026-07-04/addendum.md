# XuyenViet AI Travel Information MVP PRD Addendum

## Source Inputs

- Brainstorming intent: `_bmad-output/brainstorming/brainstorm-ai-travel-info-mvp-2026-07-04/brainstorm-intent.md`
- Market landscape research digest captured during PRD creation.

## Resolved Product Decisions

- Public MVP surface: AI Ask chat.
- Launch intent: public MVP entry with authenticated AI Ask.
- Initial geography: Hanoi-to-HCMC road-trip corridor.
- User language: Vietnamese.
- Authentication: Google Login.
- Access model: public sign-in without an email allowlist; Google Login is required before AI Ask.
- Initial operator model: owner/admin first, expandable to operators later.
- Minimum public-MVP seed data target: 100 approved knowledge cards.
- Initial confidence labels: `unverified`, `community`, `curated`, `partner`, `official`.
- Source display minimum: source title/label, source type, URL when available, collected/checked date when available, confidence label, and freshness warning when applicable.

## Provisional Assumptions For Architecture

- Preferred AI access path: OpenAI-compatible AI Gateway, not direct OpenAI API calls.
- The AI Gateway must be configured with its base URL and API key per environment; downstream model/provider data-use settings must ensure project/user data is not used to train provider models where configurable.
- Web search fallback is required in MVP because curated data starts sparse.
- Web search provider is an architecture decision, but must support Vietnamese, source URLs/titles/snippets, provenance capture, and official/provider-source preference.
- Google Maps integration is post-MVP.
- Memory correction can be chat-based in MVP.
- Memory deletion must support user-owned chat session and trip project deletion for MVP, with deletion propagation defined by architecture before implementation.
- Conversation transcript retention must follow the final PRD and privacy notice; do not treat earlier debugging-retention assumptions as active requirements unless a later privacy decision reinstates them.

## Market Context Digest

- AI trip planners commonly converge on chat-to-itinerary plus booking marketplace flows.
- Road-trip-specific competitors emphasize route optimization, stop discovery, map-first planning, and logistics.
- Strong products combine AI generation with manual control; generated plans should be treated as drafts.
- Most competitors use third-party trust surfaces rather than detailed citations, leaving room for XuyenViet to differentiate on source, last-checked, and confidence labels.
- Personalization is shifting toward persistent preference memory and imported context.
- Vietnam travel information is rich but fragmented and often static.
- Freshness risk is high for road trips: prices, road conditions, hours, parking, weather, service availability, traffic restrictions, and seasonal events change often.

## Still Open

- Exact web search provider/mechanism.
- Exact privacy-policy wording for AI Gateway-backed memory and chat processing.
- Whether source URLs are always visible by default or hidden behind expandable details.
- Detailed Facebook content reuse policy beyond provenance and non-official labeling.
