# Epic 21 Story 21.7 Approved Minor Course Correction

**Date:** 2026-08-17
**Decision:** Approved by product owner
**Classification:** Minor course correction

## Scope

Extend only the existing bounded planning-session JSON contract with a flat per-supported-slot source-message-ID map. Each entry stores only the user message ID that supplied its explicit planning slot. Existing aggregate `sourceMessageIds` remains a bounded aggregate list.

Story 21.7 may use this map as conversion provenance only when a slot ID equals the current completed unscoped terminal user message ID.

## Limits

No transcript, assistant prose, prompt, assumptions, provider payload, graph, claim, workflow, table, migration, schema change, endpoint, service, queue, Worker, or application implementation scope is approved by this correction.
