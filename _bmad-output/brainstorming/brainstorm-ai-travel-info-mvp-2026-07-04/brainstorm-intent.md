# Brainstorming Intent: AI Travel Information MVP

## Product Intent

Build an AI-first travel planning assistant for Vietnam road trips that reduces the time users spend finding scattered travel information. The MVP should not be an AI travel encyclopedia; it should turn collected travel knowledge into practical, source-aware trip guidance.

## MVP Thesis

The smallest valuable product is an AI Chat experience with memory and personalization, backed by curated knowledge cards and answer behavior that clearly separates sourced information, user context, general AI reasoning, and uncertainty.

## Target User/Use Case

Primary use case: a user planning a family road trip asks a broad question such as: "I want to plan a two-week trip from a given date with my two kids, destination could be HCMC, advise me."

The assistant should help even when the request is underspecified by asking key questions, proposing a starting plan, and adapting to family needs, previous trips, dates, budget, driving tolerance, and preferred hotel style.

## Must-Have Scope

- Public AI Chat / AI Ask as the one public MVP feature.
- Chat memory and personalization for traveler profile, kids ages, desired experience, previous trips, dates, start point, possible destinations, budget, driving tolerance, and hotel style.
- Admin knowledge collection flow: paste URL, text, or image; AI extracts structured knowledge cards; human approves; approved cards become searchable by AI.
- Retrieval from curated knowledge cards.
- Travel-specific answer format: direct answer, suggested plan or options, relevant places/services, warnings or uncertainty, sources used, and follow-up questions.
- Confidence/source layer in answers: user memory, collected sources, general AI/base knowledge, needs checking, and changing details to confirm before booking.
- Knowledge card model with minimum fields: title, type, location or route segment, summary, source, collected date, confidence, tags, and freshness-sensitive flag.
- Family-aware road-trip planning rules: shorter driving time, rest stops, learning plus fun plus rest, child-friendly experiences, convenient hotel areas, avoid late check-ins, rainy-day backups, and honest boredom warnings.

## Should-Have Scope

- Initial knowledge types should support route, hotels, sightseeing, food stops, road conditions, charging stations, parking, family-friendly stops, costs, safety, itinerary duration, and trip services such as diving.
- Initial sources may include websites, Facebook group posts about XuyenViet, and service or partner sources such as Agoda.
- AI should prioritize information in this order: user memory from conversation, curated/base knowledge, then search for updated information.
- Web search fallback can be added later once the core chat, memory, knowledge card, retrieval, and sourced-answer loop works.

## Out of Scope for MVP

- Separate polished public feature UIs for each travel information type.
- Full AI travel encyclopedia behavior.
- Google Maps integration in the first cut, though it may be considered later.
- Future user submissions as a core first-release dependency.
- Full booking or partner transaction flows.

## Knowledge/AI Principles

- Use a broad travel knowledge card model rather than many specialized data models at MVP stage.
- Treat collected internet and Facebook information as potentially incomplete or incorrect.
- Always handle uncertainty explicitly.
- Distinguish sourced information from general AI knowledge.
- Confirm freshness-sensitive or changing details before booking or acting.
- Human approval is required before extracted knowledge becomes part of the searchable AI knowledge base.

## Magic Moment

A parent asks one broad trip-planning question and receives a useful first answer: 2-3 clarifying questions, an initial two-week HCMC-oriented plan, kid-aware practical tips, relevant sourced places/services, uncertainty warnings, and suggested next steps.

## Success Criteria

- Users can ask one planning question and get a usable trip answer with sources and next steps.
- The assistant provides practical tips, not just generic information.
- Answers reflect user context, especially children, desired experience, and previous trips.
- Admins can collect travel information from raw sources into approved structured cards.
- AI responses show confidence, source provenance, and freshness warnings where appropriate.

## Risks/Open Questions

- MVP fails if the assistant does not provide useful information or practical tips.
- Collected sources may be incomplete, outdated, or incorrect.
- Search fallback timing is unresolved: core retrieval should work first, web search can follow later.
- Initial source mix needs validation, especially websites, Facebook group posts, and partner/service data.
