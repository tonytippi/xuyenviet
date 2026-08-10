# Documentation Index

`docs/` is project knowledge. Its directories distinguish whether a document describes a runnable capability or future direction.

## Source Of Truth

The active MVP requirements sources are the [PRD](../_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md) and its [approved addendum](../_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/addendum.md). Their approved scope is implemented through the linked architecture, epics, stories, and [sprint status](../_bmad-output/implementation-artifacts/sprint-status.yaml) under `_bmad-output/`.

When documents disagree, use this order:

1. Active PRD and approved addenda for product scope and requirements.
2. Active architecture and epics/stories for technical and delivery decisions.
3. Code and runbooks for implemented behavior and operations.
4. Proposals and roadmaps only as future planning input.

## Current Runbooks

Runbooks document implemented commands and their operational limits. They must match code and must not describe planned behavior as executable.

| Document | Status | Use |
|---|---|---|
| [Facebook Capture Operations](./runbooks/facebook-capture.md) | Capture implemented; production scheduling remains blocked by documented readiness gaps | Run or recover controlled Facebook capture. |
| [YouTube Capture Operations](./runbooks/youtube-capture.md) | Submitted-video Gemini capture implemented; discovery is not implemented | Run or recover individual queued-video capture. |

## Proposals

Proposals record product direction and planning context. A proposal does not authorize implementation unless its status says it has been promoted through the BMad workflow; the active PRD, architecture, epics, and stories remain authoritative. Superseded plans and historical implementation evidence belong under `_bmad-output/`, not here.

| Document | Status | Planning use |
|---|---|---|
| [AI-First YouTube Discovery](./proposals/ai-first-youtube-discovery.md) | Approved bounded URL-only Discovery scope; implementation in Epics 18-20 | Requirements context for documented-API Discovery, manual capture handoff, and control-tower delivery. |
| [Trip Project Product Direction](./proposals/trip-project-product-direction.md) | Proposed beyond the implemented basic single-owner project | Future structured trip planning. |
| [Place Intelligence And Accommodation Enrichment](./proposals/place-intelligence-and-accommodation-enrichment.md) | Proposed; Maps, OTA, booking, and provider enrichment are MVP non-goals | Future opt-in, chat-first accommodation-decision assistance and place identity planning. |

## Roadmaps

Roadmaps sequence possible future investments; they are not committed scope or a build specification.

| Document | Status | Planning use |
|---|---|---|
| [Knowledge Retrieval And Traveler Memory](./roadmaps/knowledge-retrieval-and-traveler-memory.md) | State-aware lexical baseline implemented; later search and memory work proposed | Post-MVP retrieval and memory decisions. |

Before promoting a proposal or roadmap item, update the relevant BMad artifacts in this order: PRD, architecture, UX when applicable, epics/stories, implementation-readiness report, then sprint plan. Replace or remove the superseded proposal once those artifacts become the authoritative plan.
