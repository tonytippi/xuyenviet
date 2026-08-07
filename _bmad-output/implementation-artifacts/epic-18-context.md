# Epic 18 Context: Automated Discovery Mission Foundation

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Establish a safe, operator-governed YouTube Discovery foundation that turns bounded coverage, freshness, conflict, and anonymized-demand signals into scheduled documented-API URL discovery. It must create useful deduplicated candidates and safe enrichment context while preserving Knowledge as the only source, capture, evidence, and publication lifecycle owner.

## Stories

- Story 18.1: Establish Discovery Ownership, Policy, and Audit Foundation
- Story 18.2: Execute Fenced Scheduled Discovery Runs
- Story 18.3: Manage System and Operator Query Proposals
- Story 18.4: Discover Canonical YouTube Candidates Safely
- Story 18.5: Enrich Candidates With Safe Derived Signals and Retention

## Requirements & Constraints

- Discovery is URL-only. It must not create or directly write Knowledge sources, capture versions, ingestion jobs, evidence, cards, publication state, or traveler content. It must not invoke, schedule, enqueue, or retry manual `youtube:capture` or Gemini video analysis.
- Discovery policy is one versioned PostgreSQL record governing global enablement, score bands and weights, cadence, retention, and bounded concurrency and retry settings. Runs snapshot the effective policy version. Hard budget or quota reservations are out of scope.
- Global disable stops Discovery planning, search, enrichment, and triage work only. It does not alter queued Knowledge sources or manual capture. A Worker must fence disabled work before every provider call, candidate write, and retry or requeue write.
- System planning may use only bounded aggregate upstream ports for coverage gaps, freshness risk, unresolved conflicts, and anonymized AI Ask demand. It must never consume or persist traveler identity, prompts, conversations, answers, raw source material, or provider payloads.
- Search and enrichment may use documented YouTube Data API capabilities only. Browser scraping, undocumented APIs, transcript scraping, downloads, media persistence, and a second Gemini path are prohibited.
- Candidate identity is one canonical individual public YouTube video ID. Preserve query/run appearances and bounded ranking history without producing duplicate review work. Use the shared canonicalizer for supported HTTPS `youtube.com` and `youtu.be` forms, returning `https://www.youtube.com/watch?v=<video-id>` or rejecting before provider or capture work.
- Retain only bounded safe video and channel metadata, sanitized derived comment signals, policy and ranking references, and safe errors. Never retain raw comments, prompts or responses, provider payloads, transcripts, media, credentials, cookies, raw source content, evidence spans, or traveler content. Candidate, audit, and dedupe retention is policy-controlled with an initial 180-day default; derived comment signals use a shorter policy-controlled TTL.
- Verify canonicalization, cross-query deduplication, safe upstream-port input, leases and revocation, provider failures, retention, and persistence exclusions with focused unit tests and serial database integration tests where applicable.

## Technical Decisions

- Discovery is a PostgreSQL-backed modular workflow. Drizzle owns Discovery schema and migrations; Discovery modules exclusively own its policy, query, run, candidate, safe audit, retention, and read-model records.
- Implement the registered `youtube-discovery` Worker adapter with existing readiness and safe telemetry contracts. API commands manage policy and queries; they never execute Discovery stages. Worker execution is finite, leased, fenced, idempotent, and uses bounded exponential retry with safe terminal error codes.
- Run state is exactly `queued`, `running`, `retrying`, `completed`, `failed`, or `cancelled`; only the Worker advances nonterminal runs and terminal runs never reopen. Lease expiry returns nonterminal work to `queued`; policy revocation transitions it to `cancelled`. Each terminal result writes one safe audit and telemetry outcome.
- Query proposals use one aggregate for system and operator origins, recording origin, reason, priority, query text, enabled or paused state, and cadence. Keep global disable distinct from a per-query pause. Do not add advanced rule builders or candidate, channel, or query blocking/exclusion policy.
- Use the shared exported canonicalizer with Knowledge intake. Query the Knowledge-owned safe prior-capture eligibility lookup by canonical video identity and compatibility; never query Knowledge tables directly or persist a Knowledge source ID or link.
- Attribute automated execution to the immutable `system-youtube-discovery` system actor. Protected commands retain the real operator as actor and record actor, target, action, timestamp, and bounded safe before/after summary. System actors cannot authenticate, hold roles, or own user-scoped records.
- Candidate recommendation and review, AI metadata triage, Knowledge intake handoff, and control-tower UI are later-epic concerns. This foundation may retain bounded ranking context but does not implement those behaviors.

## Cross-Story Dependencies

- Story 18.1 creates the policy, aggregate records, audit foundation, and system executor required by all later Epic 18 work.
- Story 18.2 relies on policy and run state to register fenced Worker execution; Story 18.3 uses that execution path to refresh system query proposals.
- Story 18.4 depends on the foundation and Worker execution to create canonical candidates and appearances; Story 18.5 extends those candidates with safe enrichment, derived signals, retention, and boundary verification.
- The epic depends on established API, Worker, Audit, and Knowledge safe-port foundations. It supplies the candidate, policy, run, and safe read-model substrate for Epic 19 triage and review and Epic 20 operations views.
