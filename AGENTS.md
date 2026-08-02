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

## Simplicity And Deployability

Favor the smallest solution that fully satisfies the stated requirement and existing acceptance criteria. Do not add abstraction, configurability, extensibility, infrastructure, dependencies, or architecture for hypothetical future needs.

- Start by identifying the minimal change to the existing codebase; reuse established patterns and dependencies before introducing new ones.
- Prefer a direct implementation in the current module over a new service, package, layer, schema, queue, feature flag, or deployment component unless there is a concrete present requirement.
- Treat operational cost as a first-class constraint: avoid changes that require new environment variables, external services, migrations, workers, scheduled jobs, deployment steps, or monitoring unless they are essential to the requested behavior.
- Do not over-research or enumerate speculative alternatives for a straightforward task. Time-box investigation and proceed with the simplest well-supported option.
- Keep the scope focused on the request. Do not bundle refactors, cleanup, performance work, or edge cases that do not affect the requested outcome.
- Before adding a dependency or operational component, state the immediate requirement it solves and why the existing stack cannot solve it more simply. If that justification is absent, do not add it.
- When more than one solution is correct, choose the one with fewer moving parts, lower deployment risk, and a smaller test surface.
- Validate the changed behavior with the narrowest relevant checks first; run broader verification only when the change or project rules require it.

Document significant product and engineering work through BMad artifacts before implementation:

- PRD
- architecture
- epics and stories
- sprint/status artifacts when implementation begins

## Documentation Currency And Source Of Truth

Keep BMad artifacts current with the active requirements and implementation plan. When a story, spec, proposal, readiness report, or other generated artifact is superseded and no longer supports the current work, remove it rather than allowing it to mislead later agents. Before deletion, identify and update or remove every internal reference to avoid broken links. Preserve only documents that remain authoritative or provide required historical context, such as the active sprint status, current epic context, and completed retrospective records.

When requirements, planning artifacts, and implementation appear to conflict or need clarification, consult these sources in order:

1. The current PRD for product requirements and scope.
2. The current architecture documents for technical decisions and invariants.
3. The codebase for the actual implemented behavior and integration constraints.

Do not treat superseded stories, old specs, historical proposals, or earlier readiness reports as authoritative over the current PRD, architecture, or codebase.

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

## Test Execution Boundaries

- Use `pnpm test:unit` for infrastructure-free tests. Unit tests must not require `DATABASE_URL`, `DATABASE_URL_TEST`, Drizzle migration, or a PostgreSQL connection.
- Use `pnpm test:integration` for tests that read or mutate PostgreSQL. Integration setup owns `DATABASE_URL_TEST` validation, test-database migration, and connection cleanup.
- A database integration test that depends on clean tables must explicitly call `resetTestDatabase()` in its own setup. Do not restore a global reset hook that truncates the database for every Vitest test.
- Integration tests share one physical test database and must remain serial. Do not enable integration file parallelism or multiple workers unless the suite first gets worker-isolated schemas or databases.

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
