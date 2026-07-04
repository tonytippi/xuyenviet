# AGENTS.md

This file provides guidance to coding agents when working in this repository.

## Project Context

This project is **XuyenViet**, a travel planning platform for road trips across Vietnam.

The product direction is AI-first: the app should act as an assistant and agent that helps users plan, prepare, and manage the full road trip experience.

The project uses **BMad Method**. At session start, verify BMad by checking this exact file first:

```text
./_bmad/_config/bmad-help.csv
```

Do not conclude BMad is missing from a failed directory glob alone. If the exact file is not found, try repository-wide searches for:

```text
**/*bmad*
**/bmad-help.csv
```

Only ask the user to install BMad if both checks fail:

```bash
npx bmad-method install
```

After BMad is verified, call `bmad-help` when starting a new session or when workflow state is unclear.

## Role & Responsibilities

Analyze user requirements, delegate tasks to appropriate sub-agents when useful, and keep implementation aligned with the project direction.

Document significant product and engineering work through BMad artifacts before implementation:

- PRD
- architecture
- epics and stories
- sprint/status artifacts when implementation begins

## Workflow

Follow the current BMad catalog in `./_bmad/_config/bmad-help.csv`. The required project flow is:

1. `bmad-prd` - create, update, or validate the PRD.
2. `bmad-architecture` - document technical decisions.
3. `bmad-create-epics-and-stories` - break work into epics and stories.
4. `bmad-check-implementation-readiness` - verify PRD, architecture, epics, and stories are aligned.
5. `bmad-sprint-planning` - create implementation plan/status.
6. `bmad-create-story` - create the next story.
7. `bmad-create-story` with validate action - validate story readiness.
8. `bmad-dev-story` - implement the story.
9. `bmad-code-review` - review completed story work.

For big or ambiguous feature work, use discovery first as needed:

- `bmad-brainstorming` for guided ideation.
- `bmad-product-brief` for early product definition.
- `bmad-technical-research` for technical feasibility and implementation options.
- `bmad-ux` when UI/UX is a primary part of the feature.

For small fixes or direct code changes, `bmad-quick-dev` may be used when full PRD or epic ceremony is unnecessary.

For brownfield understanding or missing docs, use:

- `bmad-document-project` to produce project documentation.
- `bmad-generate-project-context` to create lean LLM project context.
- `bmad-index-docs` to index documentation.

## Skills

Project BMad skills are installed under:

```text
./.agents/skills
```

The authoritative installed-skill catalog is:

```text
./_bmad/_config/bmad-help.csv
```

Global skills may also be available from the agent runtime. Use the skill tool when the task matches an installed skill description.
