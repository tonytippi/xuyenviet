---
name: chief-of-staff
description: "Run the BMAD backlog autonomously through fresh Herdr panes: create and validate each story, develop, commit, review, and perform an epic review. Use only when the user asks to run, automate, or orchestrate the BMAD backlog with Herdr."
---

# Chief of Staff

## Purpose

Orchestrate the active BMAD implementation backlog from `sprint-status.yaml`.
Every BMAD action runs in a newly split Herdr pane with a newly started OpenCode
agent, so no worker inherits a previous worker's conversational context.

The source of truth is `{implementation_artifacts}/sprint-status.yaml`, as
resolved from `_bmad/bmm/config.yaml`. Never infer completion from terminal
text alone. A story is complete only when its sprint status is `done`; an epic
is complete only when its sprint status is `done` and every associated story is
`done`.

## Guardrails

- Requires a clean tracked worktree before starting. Stop and report the exact
  `git status --short` output if it is not clean. Do not absorb or commit work
  that predates the run.
- Requires `HERDR_ENV=1`. Do not control Herdr from outside a Herdr pane.
- Confirm the installed CLI syntax with `herdr --help`, `herdr pane`, and
  `herdr agent` before issuing its first mutating Herdr command.
- Use `--current`, explicit returned pane IDs, `--cwd "$PWD"`, and
  `--no-focus`. Never target the human's focused pane implicitly.
- Start each worker with `herdr agent start <name> --kind opencode --pane
  <pane-id>`. Worker names must be unique and match Herdr's naming rules.
- Submit work only with `herdr agent prompt <name> "..." --wait`. Before
  treating a wait result as success, read the worker's final output with
  `herdr agent read <name> --source recent-unwrapped --lines 160`.
- A `blocked`, `unknown`, timeout, failed command, missing artifact, failed
  test, validation failure, review finding, or unexpected status transition is
  a stop condition. Read the worker output, report the blocker, and do not
  continue the loop automatically.
- Do not close panes, tabs, workspaces, or agents created by another person or
  another run. Close only pane IDs recorded by this run after the applicable
  story or epic review has been independently verified as approved.
- Use no parallel workers against this checkout. The workflow is strictly
  sequential because each stage changes shared files and sprint state.
- Do not use `bmad-dev-auto` here. It is intentionally one-story scoped and
  has its own loop; this orchestrator must own the backlog-level lifecycle and
  pane boundaries.

## Inputs And Statuses

Resolve BMAD configuration first:

```bash
uv run --python 3.11 "$_BmadRoot/scripts/resolve_config.py" --project-root "$PWD"
```

Set `_BmadRoot="$PWD/_bmad"`. From the returned configuration, obtain
`implementation_artifacts`, then use
`$implementation_artifacts/sprint-status.yaml`.

Interpret the sprint map using the installed `bmad-sprint-status` rules:

- Story statuses: `backlog`, `ready-for-dev`, `in-progress`, `review`, `done`.
- Epic statuses: `backlog`, `in-progress`, `done`.
- Legacy `drafted` means `ready-for-dev`; legacy `contexted` means
  `in-progress`.
- Sort stories by numeric epic then numeric story. Do not use lexicographic
  sorting (`10-1` must follow `9-9`).

At the beginning of every loop iteration, start a new coordinator pane and
agent. Ask it to use `bmad-sprint-status` in data mode, inspect the full sprint
file, and return exactly one of:

`create <story-key>`, `develop <story-path>`, `review <story-path>`,
`epic-review <epic-number>`, `complete`, or `blocked <reason>`.

Do not let this coordinator modify code, story documents, or sprint status.
Its job is to select the next safe action and verify the prior action's state.

## Herdr Worker Procedure

For every stage below, create a brand-new sibling pane. Pick `right` for a
wide caller pane and `down` for a narrow/tall caller pane, based on
`herdr pane layout --pane "$HERDR_PANE_ID"`. Example:

```bash
herdr pane split --current --direction right --cwd "$PWD" --no-focus
herdr agent start <unique-name> --kind opencode --pane <returned-pane-id>
herdr agent prompt <unique-name> "<stage prompt>" --wait --timeout 1800000
herdr agent read <unique-name> --source recent-unwrapped --lines 160
```

Take `<returned-pane-id>` only from the JSON returned by `herdr pane split`.
If the new worker reports `blocked` or the prompt wait fails, inspect it with
`herdr agent get <unique-name>` and the read command above, then stop.

Immediately record every returned pane ID in an in-memory run ledger:

- `story_panes[story-key]`: coordinator, create, validate, develop, commit,
  review, and any repair panes for that story.
- `epic_review_panes[epic-number]`: only the epic-review pane for that epic.

Never put the caller pane in either ledger. On a stop condition, leave all
recorded panes open for diagnosis. On a successful cleanup, run
`herdr pane close <pane-id>` for each recorded ID, one at a time. If a close
fails because the pane was already closed, record that fact and continue; for
any other close failure, stop and report it without attempting to close an
unverified pane.

## Story Lifecycle

Run the selected story through these stages in order. The text sent to each
worker is intentionally explicit so it can load the relevant project skill.

### 1. Create

For `create <story-key>`, create a fresh pane and prompt:

```text
Use the bmad-create-story skill to create story <story-key>. Follow its workflow
fully and non-interactively where the installed workflow permits. Work only on
this target story. Do not develop code, commit, or begin another story. Finish
only after the story file exists and sprint-status.yaml marks this story
ready-for-dev. Report the absolute story-file path, the final story status, and
any blocker.
```

After completion, independently re-read the full sprint file. Continue only
when the target is `ready-for-dev` and its story file exists. Otherwise stop.

### 2. Validate

Create a new pane and prompt:

```text
Use bmad-create-story with its validate action for story <absolute-story-path>.
Follow the validation workflow fully. Do not implement code, commit, or select
another story. If validation identifies a repairable story-document issue,
repair it and rerun validation in this same worker until it passes. Finish only
when the target remains ready-for-dev and validation is successful. Report the
validation outcome and any blocker.
```

Continue only on an explicit successful validation and a `ready-for-dev`
target. Do not treat a warning or an unfinished validation report as a pass.

### 3. Develop

Create a new pane and prompt:

```text
Use bmad-dev-story to implement <absolute-story-path>. Follow the skill exactly,
including all required tests and updates to the story record and sprint status.
Do not commit. Do not start a different story. Finish only when all acceptance
criteria and tasks are complete and the target story has reached the review
state. Report tests run, changed files, the final sprint status, and any blocker.
```

Re-read sprint status and require the target to be `review`. If it remains
`in-progress`, is missing, or the worker reports an incomplete task, stop.

### 4. Commit

Create a new pane and prompt:

```text
Act as the commit gate for completed story <story-key>. Inspect git status and
the target story's File List and acceptance record. Verify the worktree contains
only this story's intended changes, run the project's relevant verification if
needed, then create one conventional, descriptive git commit for this story.
Never amend, force, reset, stash, discard, or include unrelated changes. If the
tree is already clean, verify whether the story's implementation is already
committed and report the exact commit; otherwise stop as blocked. Report the
commit SHA, subject, files committed, and any blocker.
```

Require a clean `git status --short` and a non-empty commit SHA. If either check
fails, stop before review.

### 5. Story Review

Create a new pane and prompt:

```text
Use bmad-code-review to review committed story <absolute-story-path> and its
implementation. Follow the skill completely. Compare the current commit and
story acceptance criteria. Do not edit code, commit, or start another story.
Report either APPROVED with no actionable findings, or BLOCKED with every
actionable finding and its severity.
```

If the review is approved, re-read sprint status and require the target to be
`done`. Then close every pane in `story_panes[story-key]`, including this
approved review pane. Do not close a pane until the status check succeeds.
Restart the coordinator loop in a new pane.

If the review contains actionable findings, do not advance. Create a new fresh
development pane, prompt it to use `bmad-dev-story` on the same story and fix
only those findings, then repeat the commit and story-review stages. Cap this
repair loop at two attempts; after the second non-approval, stop with the full
review evidence for human triage.

## Epic Completion Review

After every approved story, inspect its epic. When every story whose key begins
with `<epic-number>-` is `done`, and `epic-<epic-number>` is `done`, create one
fresh pane and prompt:

```text
Use bmad-code-review for the completed Epic <epic-number>. Review the aggregate
of all stories in the epic, their acceptance criteria, cross-story integration,
and the commits that implement them. Do not edit code or commit. Report either
APPROVED with no actionable epic-level findings, or BLOCKED with the findings
and affected story keys.
```

Proceed to the next backlog story only after this epic review is approved. On
approval, close the pane in `epic_review_panes[epic-number]`. If it finds an
issue, stop for human triage rather than changing a completed epic without an
explicit corrective plan, and leave the review pane open.

## Completion

When the coordinator reports `complete`, independently verify that no story is
in `backlog`, `ready-for-dev`, `in-progress`, or `review`, and that every epic
is `done`. Report the list of committed story SHAs and approved epic reviews.
Close the final coordinator pane after that verification. All successful story
and epic worker panes will already have been closed; leave only panes associated
with a stopped or blocked run open as the execution record.
