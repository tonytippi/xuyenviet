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
- Submit work only with `herdr agent prompt <name> "..." --wait`. The
  `prompt --wait` response is only a lifecycle signal, never a worker report
  source. Before treating a wait result as success, read and retain the
  worker's terminal output with `herdr agent read <name> --source
  recent-unwrapped --lines 160`.
- Every mutating worker must read, synchronize, and report the target entry in
  `sprint-status.yaml` before it finishes. The coordinator is read-only, but
  must use the most recent worker output as well as the file to select the next
  action. Never make a decision from the sprint file alone.
- A `blocked`, `unknown`, timeout, failed command, missing artifact, failed
  test, validation failure, or unexpected status transition is a stop
  condition. Read the worker output, report the blocker, and do not continue
  the loop automatically. Actionable review findings enter the bounded repair
  loops described below. Status Finalization is not a review: a potential
  defect noticed by that worker is outside its authority and is not a stop
  condition. Only its objective finalization checks may block it.
- Do not close panes, tabs, workspaces, or agents created by another person or
  another run. Close only pane IDs recorded by this run.
- Retain no more than two child panes from this run at any time: the current
  worker and, when useful, its immediately preceding completed worker for
  audit. A completed pane is not a future workflow dependency and must not be
  retained until a story or epic finishes.
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

Retain the most recent completed worker's final output in an in-memory
`last_worker_result` record, together with its target story or epic and expected
final status. On the first iteration, this record is absent. After that, a
missing, malformed, blocked, or contradictory result is a stop condition.

At the beginning of every loop iteration, start a new coordinator pane and
agent. Give it `last_worker_result`, then ask it to use `bmad-sprint-status` in
data mode, inspect the full sprint file, compare both sources, and return
exactly one of:

`create <story-key>`, `develop <story-path>`, `review <story-path>`,
`epic-review <epic-number>`, `complete`, or `blocked <reason>`.

Do not let this coordinator modify code, story documents, or sprint status.
Its job is to verify the prior action and select the next safe action. It must
return `blocked <reason>` when the worker output does not explicitly confirm
the expected final status or conflicts with `sprint-status.yaml`; it must never
repeat an action merely because the file was not synchronized. An accepted
review result with actionable findings is not eligible for coordinator
selection: run its bounded repair loop first.

Give the coordinator the complete final report block, not the result of
`herdr agent prompt --wait` or a paraphrase. It must parse the final delimited
block by its field labels, accepting wrapped `SUMMARY` and `BLOCKER` values.
If that block is absent or malformed in the initial 160-line read, re-read the
same worker once with `herdr agent read <name> --source recent-unwrapped --lines 300`.
Only after that retry may a missing or malformed report become a stop
condition. Never synthesize report fields from a commit, `git status`, or the
sprint file.

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
If the prompt wait fails, inspect the worker with `herdr agent get
<unique-name>` and read its terminal output before deciding whether it
completed or is blocked. A failed wait is a stop condition only when the final
terminal report cannot be read and independently verified. If the worker
reports `BLOCKED`, stop after reading its final report.

Every mutating worker prompt must require this final, machine-checkable report:

```text
--- CHIEF-OF-STAFF-REPORT ---
RESULT: SUCCESS or BLOCKED
TARGET: <story-key, absolute story path, or epic number>
SPRINT STATUS: <target entry> = <final status>
SPRINT STATUS SYNCHRONIZED: yes or no
SUMMARY: <concise stage evidence, including tests, commit, or review outcome>
BLOCKER: <none or reason>
--- END-CHIEF-OF-STAFF-REPORT ---
```

The report must be the worker's last substantive terminal output. Each label
must begin a line and appear exactly once within the final delimited block;
`SUMMARY` and `BLOCKER` values may continue on following wrapped lines until
the next label or the end delimiter. After reading a mutating worker's final
output, parse the final complete delimited block and reject it unless it has
`RESULT: SUCCESS`, `SPRINT STATUS SYNCHRONIZED: yes`, and the exact
stage-appropriate final status independently observed in `sprint-status.yaml`.
Save that complete block as `last_worker_result` before creating another pane.
A worker that cannot synchronize the expected status must return `BLOCKED`; do
not repair or guess its status in the coordinator.

Maintain an in-memory rolling `audit_panes` ledger, ordered oldest to newest.
It contains only child pane IDs created by this run, including coordinator
panes. Never put the caller pane in this ledger.

- Before splitting a new pane, if `audit_panes` already contains two pane IDs,
  close and remove its oldest ID. This guarantees the new pane cannot raise the
  retained child-pane count above two.
- Add the returned pane ID to `audit_panes` immediately after the split. Once
  its result has been independently verified, it is merely the newest audit
  record; do not retain it because it belongs to a particular story or epic.
- A stop condition leaves at most the blocking pane and its immediately
  preceding audit pane open. All older panes must already have been closed.
- Run `herdr pane close <pane-id>` one at a time. If a close fails because the
  pane was already closed, remove it from the ledger and continue. For any
  other close failure, stop and report it; do not create another pane.

## Story Lifecycle

Run the selected story through these stages in order. The text sent to each
worker is intentionally explicit so it can load the relevant project skill.

### 1. Create

For `create <story-key>`, create a fresh pane and prompt:

```text
Use the bmad-create-story skill to create story <story-key>. Follow its workflow
fully and non-interactively where the installed workflow permits. Work only on
this target story. Do not develop code, commit, or begin another story. Finish
only after the story file exists and you have synchronized sprint-status.yaml to
mark this story ready-for-dev. End with the required machine-checkable report,
including the absolute story-file path in SUMMARY.
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
when validation is successful and you have synchronized sprint-status.yaml to
keep the target ready-for-dev. End with the required machine-checkable report.
```

Continue only on an explicit successful validation and a `ready-for-dev`
target. Do not treat a warning or an unfinished validation report as a pass.

### 3. Develop

Create a new pane and prompt:

```text
Use bmad-dev-story to implement <absolute-story-path>. Follow the skill exactly,
including all required tests and updates to the story record and sprint status.
Do not commit. Do not start a different story. Finish only when all acceptance
criteria and tasks are complete and you have synchronized sprint-status.yaml to
place the target story in review. End with the required machine-checkable report
and include tests run and changed files in SUMMARY.
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
commit SHA, subject, files committed, and any blocker. Before finishing,
synchronize sprint-status.yaml and preserve this story in review; do not advance
it to done. End with the required machine-checkable report and include the
commit SHA in SUMMARY.
```

Require a clean `git status --short` and a non-empty commit SHA. If either check
fails, stop before review.

### 5. Story Review

Create a new pane and prompt:

```text
Use bmad-code-review to review committed story <absolute-story-path> and its
implementation. Follow the skill completely. Compare the current commit and
story acceptance criteria. Do not edit code, commit, or start another story.
On approval, synchronize sprint-status.yaml to mark the story done. If there is
an actionable finding, set its status to in-progress and synchronize it. A
completed review returns `RESULT: SUCCESS` whether it is APPROVED or has
findings; reserve `RESULT: BLOCKED` for a review that cannot finish. Include
the review outcome and every finding with severity in SUMMARY.
```

If the review is approved, re-read sprint status and require the target to be
`done`. Keep the approved review pane only as the newest rolling audit pane;
the next pane creation will evict the oldest pane if needed. Restart the
coordinator loop in a new pane.

If the first review contains actionable findings, do not advance. Create a new
fresh development pane and prompt it:

```text
Use bmad-agent-dev to fix only the supplied actionable findings for
<absolute-story-path>. Do not begin another story or perform a code review.
Run the relevant tests, update the story record, and synchronize
sprint-status.yaml to set this story to review. Do not commit. End with the
required machine-checkable report, including the findings fixed, tests run, and
changed files in SUMMARY.
```

After the repair report and sprint-status synchronization are verified, run the
Commit stage and then repeat Story Review once.

If the second review still contains actionable findings, classify whether it
exposes substantial new risk. Substantial new risk means a high-severity
finding, or a new systemic acceptance-criteria, security, data-integrity, or
cross-feature failure that materially changes confidence in the repair. Ordinary
remaining findings do not qualify. Record that classification in the review
SUMMARY.

If the second review does not expose substantial new risk, create one final
fresh development pane and give it the same repair prompt. Require it to
synchronize the story to `review`, then run the Commit stage and Status
Finalization stage. Do not run a third story review.

If the second review exposes substantial new risk, create a fresh development
pane using the same repair prompt, require it to synchronize the story to
`review`, and run the Commit stage. Then run one third and final Story Review
using the normal review prompt. If that final review is approved, synchronize
the story to `done` as usual. If it has actionable findings, create one final
fresh development pane using the same repair prompt, run the Commit stage, and
then run Status Finalization. Do not run a fourth story review. A blocked
final-fix, commit, review, or status-only worker remains a stop condition.

### 6. Status Finalization

This stage executes the bounded story-review policy after a final repair
commit: either after a second review that did not expose substantial new risk,
or after repairing findings from the permitted third review. It is
administrative finalization, not an additional review or an opportunity to
reopen the repair loop. Its only blocking conditions are an unverifiable
supplied commit, a non-clean worktree, a missing story record, or an inability
to synchronize the required records.

Create a fresh pane and prompt:

```text
Finalize completed story <absolute-story-path> after its final repair commit.
This is a status-only operation, not an additional code review. Do not inspect source
code or diffs for correctness, evaluate acceptance criteria, discover or report
new findings, run tests, edit implementation code, run a code review, or create
a commit. Verify only that the supplied final repair commit exists and the
worktree is clean, then update the story record to done and synchronize
sprint-status.yaml to mark this story done. Do not leave the story in review or
in-progress because of a potential issue noticed while performing these limited
checks; the bounded repair loop is complete. Return BLOCKED only if the supplied
commit cannot be verified, the worktree is not clean, the story record is
missing, or the required done status cannot be synchronized. End with the
required machine-checkable report including the verified commit SHA and final
status in SUMMARY.
```

Continue only when the report is successful and both the story record and
`sprint-status.yaml` independently show `done`.

## Epic Completion Review

After every completed story, inspect its epic. When every story whose key begins
with `<epic-number>-` is `done`, and `epic-<epic-number>` is `done`, create one
fresh pane and prompt:

```text
Use bmad-code-review for the completed Epic <epic-number>. Review the aggregate
of all stories in the epic, their acceptance criteria, cross-story integration,
and the commits that implement them. Do not edit code or commit. Report either
APPROVED with no actionable epic-level findings, or actionable findings with
affected story keys. Synchronize sprint-status.yaml before finishing: preserve
`epic-<epic-number>` as done. End with the required machine-checkable report.
```

If the first epic review has actionable findings, create a fresh development
pane for each affected story in numeric order. Prompt it to use `bmad-agent-dev`
to fix only the assigned epic-review findings, run relevant tests, update the
story record, and leave the story in `review` without committing. Run the Commit
stage and Status Finalization stage for each repaired story. Once every affected
story is again `done`, repeat the epic review once.

If the second epic review still has actionable findings, repeat that repair,
commit, and status finalization sequence for its affected stories, then preserve
the epic and all stories as `done`. Do not run a third epic review. Any blocked
worker, failed verification, or incomplete status finalization remains a stop
condition.

## Completion

When the coordinator reports `complete`, independently verify that no story is
in `backlog`, `ready-for-dev`, `in-progress`, or `review`, and that every epic
is `done`. Report the list of committed story SHAs and completed epic reviews.
After that verification, close every remaining pane in `audit_panes`, one at a
time. Successful runs leave no child pane open; stopped or blocked runs leave
at most two as the execution record.
