---
name: chief-of-staff
description: "Run the BMAD backlog sequentially through fresh Herdr panes. Delegate each ready story's implementation, review, and commit loop to bmad-dev-auto."
---

# Chief of Staff

Run the active backlog from `{implementation_artifacts}/sprint-status.yaml`.
`SKILL.legacy.md` preserves the pre-dev-auto orchestrator.

## Rules

- Require `HERDR_ENV=1`, a clean tracked worktree, and confirmed `herdr` CLI
  syntax before mutating commands. Use explicit pane IDs, `--cwd "$PWD"`, and
  `--no-focus`; never target the human pane.
- Work strictly sequentially. Retain at most two panes created by this run.
- Read `sprint-status.yaml` as the backlog source of truth. A story is complete
  only when its story record and sprint entry both say `done`.
- For `backlog` stories, use `bmad-create-story`, validate it, and synchronize
  it to `ready-for-dev`. Then run the worker below.
- On `idle`, read worker output. `idle` is only a progress signal: do not start
  another stage until the worker reports completion and the coordinator confirms
  the synchronized target status. If results are pending, wait for the same
  worker again. Do not request a report reprint merely because it is idle.
- On `blocked`, `unknown`, or timeout, inspect the worker output and relevant
  artifacts. Make one narrowly scoped recovery attempt, then escalate with the
  evidence if it fails.

## Story Worker

For each ready story, start one fresh OpenCode worker and send this prompt:

```text
Run bmad-dev-auto for the supplied BMAD story.

Authoritative requirements: <absolute story path>
Sprint status: <absolute sprint-status.yaml path>
Target story key: <story key>

Read the story fully and use it as the requirements source. bmad-dev-auto may
create its own spec-*.md runtime artifact; do not treat that spec as a replacement
for the story. Run its complete unattended plan, implementation, review, repair,
verification, and commit loop.

All subagents must be synchronous/blocking. In particular, wait for every
parallel review layer to return or be explicitly recorded as failed before you
claim completion. Do not detach subagents or finish while they are running.

After bmad-dev-auto reaches done: update the BMAD story's task/acceptance and
review record as appropriate; synchronize this exact sprint entry to `done`; and
commit the resulting intended implementation, story, spec, and sprint-status
changes. Do not modify another story. If any required result cannot be completed,
leave the target status accurate and explain the blocker.

End with a concise final result containing the story key, bmad-dev-auto status,
review outcome, tests, commit SHA, and the synchronized sprint status.
```

Accept completion only when the output states that `bmad-dev-auto` reached
`done`, gives the target key and commit SHA, and independently confirms that the
story record and `sprint-status.yaml` entry are both `done`. Otherwise continue
waiting or use the bounded recovery rule.

## Epic And Completion

When all stories in an epic are done, run one fresh `bmad-code-review` worker
for the epic. Its review subagents must be synchronous. Preserve the epic's
status unless the review requires a targeted repair; repair affected stories via
the Story Worker, then rerun the epic review once. When no actionable stories
remain and every epic is done, report commits and epic-review outcomes, then
close panes created by this run.
