---
name: chief-of-staff
description: "Run or resume one BMAD epic autonomously and sequentially through Herdr workers by dispatching each stories.yaml entry to bmad-build-auto, synchronizing sprint status, and completing the epic. Use when the user asks to orchestrate an epic or spec folder unattended with bmad-build-auto."
---

# Chief of Staff

Run one explicitly selected epic from a canonical spec folder through
`bmad-build-auto`. Keep this process as the coordinator; run every mutating stage
in a fresh Herdr worker. Do not start a different epic in the same run.

`bmad-build-auto` owns each story's planning, implementation, review, repair,
verification, generated story spec, and reviewed commits. Chief of Staff owns
story dispatch, sprint-status synchronization, cross-session reconciliation,
and the epic terminal status. Do not recreate any stage that build-auto owns.

## Preconditions

- Require an explicit epic number or spec-folder path from the invoking user.
- Resolve `{implementation_artifacts}` with
  `_bmad/scripts/resolve_config.py`; use its absolute `sprint-status.yaml` path.
- Resolve the spec folder. Prefer an explicit path; otherwise require exactly
  one `_bmad-output/specs/spec-epic-<N>` directory.
- Require readable `SPEC.md` and parseable `stories.yaml`. Require every story
  entry to have a unique `id`, non-empty `title`, and non-empty `description`.
  Require each filename prefix `<id>-` to be unambiguous; raw ids such as
  `21-1` and `21-10` may share characters because their hyphen-terminated
  prefixes remain distinct. Treat `invoke_dev_with` as optional orchestration
  guidance.
- Confirm that `epic-<N>` in `sprint-status.yaml` is `backlog` or `in-progress`.
  Refuse a `done` epic unless its completion evidence is inconsistent and the
  user explicitly asks to reconcile it.
- Before the first mutation, require `HERDR_ENV=1`, a completely clean
  `git status --porcelain=v1`, and successful `herdr --help`,
  `herdr pane --help`, `herdr agent --help`, and `herdr integration status`
  checks. A clean tree includes untracked files.
- Accept the current branch only when the user explicitly selected it for this
  run or its name clearly identifies the target epic/spec. Treat `main`,
  `master`, a detached HEAD, and a branch naming another epic as mismatches.
  Stop before mutation and request the intended branch; do not create or switch
  branches implicitly.
- Verify the installed syntax for every Herdr command used below before the
  first Herdr mutation. Do not install or reconfigure integrations silently.
- Work strictly sequentially. Retain at most two panes created by this run,
  record their exact pane IDs, and close only those panes.

If another session is still migrating or changing the epic artifacts, stop at
the clean-tree precondition. Never absorb, commit, revert, or repair that
session's changes.

## Authoritative State

- Preserve the entry order in `stories.yaml`. It is the execution and dependency
  order; never replace it with numeric or lexicographic sorting.
- `stories.yaml` is dispatch inventory and owns no status.
- For story id `<id>`, require at most one generated file matching
  `{spec_folder}/stories/<id>-*.md`. Its frontmatter status is build-auto's
  execution state: `draft`, `ready-for-dev`, `in-progress`, `in-review`,
  `done`, or `blocked`.
- Map `<id>` to exactly one sprint key beginning with `<id>-`. Parse YAML keys;
  do not use a loose textual prefix that can confuse `21-1` with `21-10`.
- The generated story spec and exact sprint entry must both say `done` before a
  story is complete. The epic is complete only when every `stories.yaml` entry
  satisfies that rule and `epic-<N>` says `done`.
- Treat a missing generated spec as not started. Resume `draft`,
  `ready-for-dev`, `in-progress`, or `in-review` by dispatching the same folder
  and story id again; build-auto routes from its persisted status.
- Treat `blocked` as a real build-auto terminal state. Inspect and report its
  `## Auto Run Result`; do not delete the spec, change its status, or bypass its
  gate automatically.
- Treat any duplicate match, unknown status, missing sprint mapping, conflicting
  done state, reordered or changed story inventory during a run, or unexpected
  later-story progress as an authoritative-state conflict and stop.

Re-read `stories.yaml`, all generated story-spec statuses, the complete Epic
sprint slice, and `git status` before every target selection. This makes a new
Chief of Staff session resume from files and commits without relying on terminal
history from an earlier session.

## Herdr Worker Procedure

For every stage, create a new sibling pane, retain the returned pane ID, start a
uniquely named OpenCode agent, and submit the stage prompt. Always use an
explicit pane ID, `--cwd "$PWD"`, and `--no-focus`.

Submit exactly one stage prompt to a worker. After that command, never send that
worker a continuation, keep-going, status, report-reprint, correction, or retry
prompt. In particular, never send `Continue the active bmad-build-auto run` or
equivalent. OpenCode queues prompts received while its current turn or a child
is active; a queued continuation can run the workflow twice after the original
turn completes.

```bash
herdr pane split --current --direction right --cwd "$PWD" --no-focus
herdr agent start <unique-name> --kind opencode --pane <worker-pane-id>
herdr agent prompt <unique-name> "<stage-prompt>" --wait \
  --until idle --until done --until blocked --timeout 120000
herdr pane process-info --pane <worker-pane-id>
herdr pane read <worker-pane-id> --source recent-unwrapped --lines 300
```

Herdr observes the foreground worker, not build-auto's internal subagents.
Require the worker to launch all build-auto subagents synchronously, join them,
and print its final coordinator report only after the skill returns.

Treat `idle`, `unknown`, timeout, and `agent_not_running` as observations, not
success or failure by themselves. After each observation, inspect process
liveness and pane output without writing to the pane or agent. `idle` can mean
the foreground OpenCode turn is awaiting synchronous build-auto subagents; it
does not authorize another prompt, another worker, target selection, sprint
sync, or failure classification.

Use only passive observations after the single stage prompt:

```bash
herdr agent get <unique-name>
herdr agent explain <unique-name>
herdr pane process-info --pane <worker-pane-id>
herdr pane read <worker-pane-id> --source recent-unwrapped --lines 300
```

Wait in bounded intervals of at most 120 seconds, then repeat those read-only
observations. If output reports a subagent, tool call, review layer, command,
queued internal work, or active build-auto step, keep waiting even when Herdr
reports `idle`. A changed pane snapshot, changed generated-spec status, new Git
revision, or explicit active-work message resets the inactivity clock.

For a build-auto dispatch, allow a two-hour stage deadline and require 30
continuous minutes with no changed snapshot, artifact, Git revision, or explicit
active-work evidence before classifying it as stalled. Reaching that threshold
still does not authorize prompting the same worker. Re-inspect the generated
spec, Git state, foreground process, and pane once; if child completion remains
ambiguous, stop and report an operational stall rather than risk duplicate
execution.

Accept completion only when the complete Chief-of-Staff report is visible and
independently agrees with artifacts, or when the process has exited and the
terminal build-auto state can be independently verified. Allow one narrowly
scoped recovery worker only after the original process has exited, no queued or
active child work is evidenced, and terminal artifacts do not establish success
or a legitimate build-auto block. Never use recovery to bypass a build-auto
`blocked` result or a product, approval, security, data-integrity, or
external-evidence gate.

Every worker must finish with:

```text
--- CHIEF-OF-STAFF-REPORT ---
RESULT: SUCCESS or BLOCKED
STAGE: dispatch, sprint-sync, or epic-finalize
TARGET: <story id or epic number>
SPEC: <absolute generated spec path or none>
SPEC STATUS: <status or none>
SPRINT STATUS: <exact key and status or unchanged>
START HEAD: <full SHA>
END HEAD: <full SHA>
TESTS: <commands and outcomes or not-run>
SUMMARY: <concise evidence>
BLOCKER: <none or exact reason>
--- END-CHIEF-OF-STAFF-REPORT ---
```

Accept a report only when every field is unambiguous and agrees with the files,
Git revisions, and worktree state. A report is transport, never authority.

## Coordinator Loop

### 1. Select The Next Story

Walk `stories.yaml` in file order and select the first story not complete under
the Authoritative State rules.

- If its generated spec is `done` but its sprint entry is not, skip dispatch
  and run Post-build Sprint Sync.
- If its generated spec is `blocked`, stop and escalate with the persisted
  blocking evidence.
- If its generated spec is missing or resumable, run Pre-dispatch Sprint Sync,
  then Dispatch Build Auto.
- If every story is complete, run Epic Finalization.

Never dispatch a later story while an earlier entry is incomplete, even when a
later story's numeric id is smaller or its sprint status was changed manually.

### 2. Pre-dispatch Sprint Sync

If needed, run a fresh status worker that changes only `sprint-status.yaml`:

```text
Prepare story <story-id> in Epic <N> for folder+ID build-auto dispatch.

Sprint status: <absolute sprint-status.yaml path>
Generated story spec: <absolute path or none>

Parse the YAML. Resolve exactly one story key beginning with `<story-id>-`.
Require it to be backlog or in-progress; refuse done when the generated spec is
not done. Set epic-<N> to in-progress and the exact story entry to in-progress.
Do not change another entry. Commit only sprint-status.yaml with a conventional
status commit if a change is needed. Leave the worktree clean. Do not invoke
bmad-build-auto or edit a generated spec. End with the Chief-of-Staff report.
```

Verify the exact entries, commit when changed, and clean tree before dispatch.

### 3. Dispatch Build Auto

Capture `start_head=$(git rev-parse HEAD)`. Read only the selected
`stories.yaml` entry and preserve its `invoke_dev_with` value verbatim when
present. Start one fresh worker with:

```text
Use bmad-build-auto exactly once for this folder+ID dispatch and wait for all of
its synchronous subagents before returning.

Spec folder: <absolute spec-folder path>
Story id: <story-id>
Additional planning context from invoke_dev_with: <verbatim value or none>
Sprint status: <absolute sprint-status.yaml path; read-only in this stage>
Start HEAD: <start_head>

Let bmad-build-auto own planning, implementation, review, repairs, verification,
generated story-spec state, and reviewed commits. Do not run bmad-create-story,
bmad-dev-auto, bmad-code-review, or separate review skills. Do not edit
sprint-status.yaml and do not start another story. Do not push. After
bmad-build-auto reaches its terminal status, inspect the generated story spec
and Git state, then end with the Chief-of-Staff report.
```

On `done`, require exactly one matching generated story spec with `status: done`,
a resolvable `baseline_revision` when Git is available, a valid `END HEAD`, all
named verification outcomes present in the spec, and a clean worktree. Confirm
that `sprint-status.yaml` did not change during dispatch.

If `followup_review_recommended: true`, dispatch the same folder and story id
once more before sprint synchronization. A `done` spec makes build-auto perform
a fresh review pass. Permit at most one coordinator-triggered follow-up pass per
story; a remaining recommendation is residual evidence, not permission for an
unbounded loop, and must be included in the final summary.

On `blocked`, require the matching spec to record `status: blocked` and the
blocking condition under `## Auto Run Result`. Preserve the worktree and stop;
do not force it clean by committing or reverting blocked work.

### 4. Post-build Sprint Sync

After a verified `done` spec, run a fresh status worker:

```text
Synchronize completed build-auto story <story-id> for Epic <N>.

Generated story spec: <absolute generated spec path>
Sprint status: <absolute sprint-status.yaml path>

Require the generated spec frontmatter to say done. Parse sprint YAML and
resolve exactly one story key beginning with `<story-id>-`. Set only that entry
to done and preserve epic-<N> as in-progress. Commit only sprint-status.yaml
with a conventional status commit if a change is needed. Leave the worktree
clean. Do not modify code or the generated spec. End with the Chief-of-Staff
report.
```

Verify the generated spec remains `done`, the exact sprint entry is `done`, the
commit exists when a change was needed, and the tree is clean. Immediately
re-enter the coordinator loop; do not pause between stories.

### 5. Epic Finalization

Re-read every `stories.yaml` entry. Require exactly one matching generated spec
with `status: done` and exactly one matching sprint entry with `done` for every
entry. Require a clean worktree. Then run one fresh status worker:

```text
Finalize Epic <N> after all folder+ID build-auto stories completed.

Spec folder: <absolute spec-folder path>
Sprint status: <absolute sprint-status.yaml path>

Parse stories.yaml in file order. Independently verify every entry has exactly
one generated story spec with status done and exactly one sprint key beginning
with `<story-id>-` whose status is done. If and only if all checks pass, set
epic-<N> to done. Change no story status. Commit only sprint-status.yaml with a
conventional status commit and leave the worktree clean. Do not run a
retrospective, push, or start another epic. End with the Chief-of-Staff report.
```

Verify `epic-<N>: done`, all story evidence again, the finalization commit, and a
clean tree. Close this run's recorded panes one at a time and report the ordered
story ids, build commit ranges, sprint-status commits, any residual follow-up
recommendations, and the final epic status.

## Escalation

Escalate only for a persisted build-auto `blocked` result, an authoritative-state
conflict, unavailable credentials or external dependency, a required
destructive action, a real approval or elapsed-time gate, or an exhausted
single operational recovery. State the evidence, safe options, and exact user
decision or external condition needed. Do not ask the user merely because a
worker became quiet, idle, timed out, exited, or omitted its report while a safe
bounded inspection or recovery remains.
