# Documentation Index

`docs/` contains two kinds of documents:

- **Current runbooks:** describe implemented operations and must match code.
- **Proposals:** record agreed-but-unimplemented product or engineering direction. They are input to a future PRD, architecture, UX, epic, and readiness workflow; they do not authorize implementation by themselves.

The active PRD, architecture, epics, stories, and sprint status under `_bmad-output/` remain the source of truth when they conflict with a proposal here.

| Document | Type | Status | Use |
|---|---|---|---|
| [Facebook Capture Operations](./facebook-capture-operations.md) | Current runbook | Capture implemented; canonical ingestion requires separately supervised worker execution | Operate and recover Facebook capture safely. |
| [YouTube Capture Operations](./youtube-capture-operations.md) | Current runbook + planned contract | Manual Gemini capture implemented; AI-first discovery is proposed | Operate current capture; follow its linked proposal before extending it. |
| [AI-First YouTube Discovery Proposal](./ai-first-youtube-discovery-proposal.md) | Proposal | Not implemented; architecture and Facebook-policy alignment required before an epic | Input for a PRD/architecture/UX update covering discovery, auto-capture, and control tower. |
| [Trip Project Product Direction](./trip-project-product-direction.md) | Proposal | Not implemented beyond the documented single-owner basic Trip Project baseline | Input for a future Trip Project PRD/architecture/UX update. |
| [Knowledge Retrieval and Traveler Memory Roadmap](./knowledge-retrieval-and-memory-roadmap.md) | Roadmap proposal | State-aware retrieval baseline partly implemented; later retrieval/memory work remains proposed | Input for post-Epic-4 retrieval and memory planning. |

Before promoting a proposal to implementation, update the relevant BMad artifacts in this order: PRD, architecture, UX when applicable, epics/stories, implementation-readiness report, then sprint plan.
