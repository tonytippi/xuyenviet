---
name: chief-of-staff
description: "Run one BMAD epic autonomously and sequentially through Herdr workers, including story preparation, development, independent review, bounded repairs, status commits, and epic review."
---

# Chief of Staff

Run one explicitly selected active epic from `{implementation_artifacts}/sprint-status.yaml`.
Do not start a different epic in the same run. `SKILL.legacy.md` is historical
reference only; this workflow is the authoritative coordinator.

## Preconditions

- Require an explicit epic number from the invoking user. Confirm that `epic-<N>`
  is `backlog` or `in-progress`; refuse `done` epics.
- Resolve `{implementation_artifacts}` with `_bmad/scripts/resolve_config.py`.
  Use its absolute `sprint-status.yaml` path rather than assuming a location.
- Before any mutation, require `HERDR_ENV=1`, `git status --porcelain=v1` to be
  empty, and successful `herdr --help`, `herdr pane --help`, and `herdr agent
  --help`. A clean tree includes untracked files.
- Verify the installed syntax for `herdr pane split`, `herdr agent start`,
  `herdr agent prompt`, `herdr agent wait`, `herdr agent get`, `herdr agent
  explain`, `herdr pane read`, `herdr pane process-info`, and `herdr pane close`
  before the first Herdr mutation.
- Check `herdr integration status` before launching a worker. The OpenCode
  integration is the preferred lifecycle authority; if it is absent or inactive,
  record that screen-manifest detection is a degraded fallback and use the
  pane-liveness checks below. Do not silently install a global integration.
- Work strictly sequentially against this checkout. Never start a worker for the
  next stage until the current worker's report and affected files are verified.
- Keep the coordinator loop active without user intervention. While an epic is
  runnable, the coordinator must autonomously poll, reconcile worker output,
  verify artifacts, perform the bounded report/recovery actions, and launch the
  next permitted stage. A quiet, idle, exited, malformed-report, or timed-out
  worker is operational evidence to handle, never a reason to return control to
  the user while a safe next action exists.
- Use an explicit pane ID returned by `herdr pane split`, `--cwd "$PWD"`, and
  `--no-focus`. Never target the caller's or a human's pane. Retain at most two
  panes created by this run and close only pane IDs recorded by this run.

## State Model

- Read the complete `development_status` map before every target selection.
- Select the lowest numeric unfinished story in the selected epic. Numeric sort
  is by epic number then story number, never lexicographic.
- A story is complete only when its BMad story file says `done`, its exact sprint
  entry says `done`, and the responsible worker's success report names the same
  key and a verified commit SHA.
- Treat `drafted` as `ready-for-dev` and `contexted` as `in-progress` only when
  reading legacy sprint files. Write current canonical statuses only.
- Advance `epic-<N>` to `done` only after every non-superseded story in that epic
  is done and the final Epic Review is clean.
- A `superseded-by-*` entry is not runnable and is excluded from the Epic done
  check. Any other unknown status is a blocker.

## Herdr Procedure

For each worker, create a new sibling pane, retain its returned pane ID as
`worker_pane_id`, start a uniquely named OpenCode agent, and submit the stage
prompt. The pane ID remains the diagnostic handle even after the agent exits;
the agent name does not.

Herdr observes the worker's foreground OpenCode process, not subagents that
OpenCode starts internally. Every worker prompt that permits subagents must
therefore require that they are synchronous/blocking: the worker must join and
evaluate every child before returning its own result, and must never print the
final Chief-of-Staff report while any child is running. The final report is the
preferred machine-checkable completion transport, not a reason for the
coordinator to wait indefinitely. Lifecycle states are solely signals to inspect
the worker pane and decide the next action.

```bash
herdr pane split --current --direction right --cwd "$PWD" --no-focus
herdr agent start <unique-name> --kind opencode --pane <returned-pane-id>
herdr agent prompt <unique-name> "<stage-prompt>" --wait \
  --until idle --until done --until blocked --timeout 120000
herdr pane read <returned-pane-id> --source recent-unwrapped --lines 300
```

Never issue one long `agent wait`: waits have no default timeout and a long
timeout makes an orchestrator unable to distinguish a slow worker from a stale
lifecycle signal. The initial `agent prompt --wait` must use a short bounded
window (120 seconds). If it returns `agent_prompt_stalled`, `timeout`, or a
server error, immediately inspect, in this order:

```bash
herdr agent get <unique-name>
herdr agent explain <unique-name>
herdr pane process-info --pane <worker-pane-id>
herdr pane read <worker-pane-id> --source recent-unwrapped --lines 300
```

If `agent get` reports a live working agent, wait again for at most 120 seconds:

```bash
herdr agent wait <unique-name> --until idle --until done --until blocked \
  --timeout 120000
```

Then repeat the inspection. Continue this bounded polling only while the process
is live and the stage's overall deadline remains. If the agent command returns
`agent_not_running`, the name can no longer be used: inspect the retained pane
with `pane process-info` and `pane read`, then verify the required artifacts,
report, git state, and sprint entry. Treat an exited worker with a complete,
independently verified report as a completed stage; treat any other exit as a
failed stage eligible for one recovery worker.

`idle` and `unknown` are lifecycle observations, not completion evidence. On
every lifecycle result or timeout, run this reconciliation loop before deciding
to wait again:

```bash
herdr pane process-info --pane <worker-pane-id>
herdr pane read <worker-pane-id> --source recent-unwrapped --lines 300
```

Classify the actual pane output together with process liveness:

- If output explicitly says a subagent, review layer, command, or required task
  is still running or pending, and the worker process is live, keep polling its
  output on a bounded interval. Do not use `agent wait` after `idle`, because it
  returns immediately for the already-idle state and would spin.
- If output contains the complete report, parse it and perform the normal
  independent verification.
- If output gives a substantive final result but the report is absent or
  malformed, first verify the stage's objective artifacts, git state, tests,
  and sprint entry. If they show the stage is complete and no child is reported
  as running, send one non-mutating report-transport prompt to the same live
  worker: `Your prior stage result appears complete. Do not edit, test, commit,
  synchronize, or start subagents. Print only a complete
  --- CHIEF-OF-STAFF-REPORT --- block for that completed result.` Then wait at
  most 120 seconds and re-read the pane once.
- If output neither establishes progress nor a completed result, or the live
  worker does not answer the one report-transport prompt within its bounded
  window, treat the stage as failed and use the one recovery worker. Do not keep
  waiting merely because the pane remains `idle`.
- If the process has exited, apply the exited-worker rules above immediately;
  do not wait for a report marker.

For an in-progress live worker, retain the latest pane snapshot, pause for a
short bounded interval, then re-read it:

```bash
sleep 15
herdr pane process-info --pane <worker-pane-id>
herdr pane read <worker-pane-id> --source recent-unwrapped --lines 300
```

Compare the new snapshot with the retained one. A changed snapshot or explicit
in-progress output is evidence to continue; an unchanged idle pane is not. Stop
the polling loop after 120 seconds without new or explicit in-progress evidence,
then run the failed-stage recovery path rather than waiting indefinitely.
Continue only while output shows in-progress work, the process is live, and the
stage deadline remains. On `blocked`, read the pane and relevant artifacts before
recovery. Use `agent explain` evidence to diagnose a fallback or misclassified
OpenCode state; do not treat it as proof that the work succeeded.

Every mutating worker must end with this complete report as its final substantive
output:

```text
--- CHIEF-OF-STAFF-REPORT ---
RESULT: SUCCESS or BLOCKED
TARGET: <story key or epic number>
STATUS: <story/epic status after this stage>
STATUS SYNCHRONIZED: yes or no
COMMIT: <full SHA or none>
TESTS: <commands and outcomes>
REVIEW: <not-run, clean, or finding summary>
SUMMARY: <concise evidence>
BLOCKER: <none or reason>
--- END-CHIEF-OF-STAFF-REPORT ---
```

Accept a report only if every field is unambiguous. Independently confirm its
target status in `sprint-status.yaml`; confirm named story/spec paths exist; and
confirm a named commit resolves with `git rev-parse`. A success report without
the expected synchronized status is a failed stage, not a completed stage.

## Story Lifecycle

### 1. Prepare a Backlog Story

If the selected story is `backlog`, run a fresh worker with:

```text
Use bmad-create-story to create and validate only story <story-key>.
Work non-interactively where the skill permits. Do not implement code.
After validation passes, synchronize only this story to ready-for-dev in
sprint-status.yaml. Commit only the target story file and sprint-status.yaml
with a conventional documentation commit, leaving the worktree clean.
End with the Chief-of-Staff report.
```

Continue only when the target story file exists, both it and the sprint entry say
`ready-for-dev`, the reported commit exists, and `git status --porcelain=v1` is
empty. This mandatory commit boundary prevents `bmad-dev-auto` from halting on
the create/validate artifacts.

### 2. Develop With Dev Auto

For a `ready-for-dev` story, capture `baseline_sha=$(git rev-parse HEAD)`, then
run one fresh worker with:

```text
Run bmad-dev-auto for the supplied BMAD story.

Authoritative requirements: <absolute story path>
Sprint status: <absolute sprint-status.yaml path>
Target story key: <story-key>
Baseline commit before this story: <baseline_sha>

Read the BMad story fully and treat it as authoritative requirements. Invoke
bmad-dev-auto with the story path and complete its plan, implementation, review,
repair, verification, and commit loop. Its runtime spec is supplementary and
never replaces the BMad story. All subagents must be synchronous/blocking.
Do not update the BMad story status or sprint status in this stage and do not
start another story. Leave the worktree clean.

End with the Chief-of-Staff report. STATUS must remain ready-for-dev and COMMIT
must be bmad-dev-auto's implementation commit SHA.
```

Accept only `bmad-dev-auto: done`, a clean worktree, a resolved implementation
commit, and a matching runtime spec with `status: done`. The coordinator retains
`baseline_sha` and the implementation SHA for the independent review.

### 3. Independent Story Review

Run a new worker after every successful development stage:

```text
Review target: Story <story-key> at <absolute story path>
Diff range: <baseline_sha>..<implementation_sha>
Sprint status: <absolute sprint-status.yaml path>

Perform an unattended independent code review. Construct exactly the supplied
diff range and read the complete BMad story. Run these three review layers in
parallel and synchronously: bmad-review-adversarial-general (Blind Hunter),
bmad-review-edge-case-hunter, and an Acceptance Auditor that checks every story
acceptance criterion and scope constraint. Wait for every layer or explicitly
record its failure. Do not use bmad-code-review because it has human checkpoints.

Do not apply code changes or start another story. Triage findings as patch,
decision-needed, defer, or dismiss. Treat patch and decision-needed findings as
actionable. A clean review has no actionable findings and no failed layer; then
update the BMad story and exact sprint entry to done. Otherwise update both to
in-progress and list every actionable finding in the final report. End with the
Chief-of-Staff report.
```

If clean, verify both records are `done`, then commit only that story record and
`sprint-status.yaml` in a separate conventional status commit. Require a clean
tree before selecting the next story.

If findings exist, run the bounded repair loop below. A failed review layer is
not clean; record it as a blocker unless the worker explicitly records the layer
failure and an independent recovery review succeeds.

### 4. Bounded Story Repair

For review findings, run one fresh repair worker with the exact finding list:

```text
Repair only the supplied independent-review findings for <story-key>.
Authoritative story: <absolute story path>
Findings: <verbatim accepted review findings>

Do not start another story. Update the BMad story record, run relevant tests,
commit only the repair and its intended story/spec artifacts, and leave the
target sprint entry in ready-for-dev. Do not mark it done. End with the
Chief-of-Staff report including the repair commit SHA.
```

After one repair, rerun Independent Story Review using the repair commit as the
new range end. Permit at most two independent story reviews total. If the second
review has findings, make one final repair, run required verification, update
the BMad story and sprint entry to `done`, and commit the repair plus status
transition. This administrative finalization is permitted only when the second
review findings were all unambiguous patches; high, security, data-integrity,
acceptance-criteria, or systemic findings block and escalate instead.

## Epic Completion

After all runnable stories in the selected epic are done, run one new worker:

```text
Perform an unattended independent review for completed Epic <epic-number>.
Review all story acceptance criteria, the aggregate diff from
<epic_baseline_sha> to HEAD, and cross-story integration.

Sprint status: <absolute sprint-status.yaml path>
Run Blind Hunter, Edge Case Hunter, and Acceptance Auditor in parallel and
synchronously. Do not use bmad-code-review because it has human checkpoints.
Do not edit code. A clean review must set epic-<epic-number> to done and preserve
every story as done. If findings are actionable, preserve the epic as in-progress,
identify affected story keys, and end with the Chief-of-Staff report.
```

For the first actionable Epic Review, repair each affected story in numeric
order using the bounded Story Repair procedure, then rerun the Epic Review once.
If the second Epic Review has any actionable finding, block and escalate with the
complete reports and affected keys. Do not mark an Epic done after an unclean
Epic Review.

On a clean Epic Review, verify `epic-<N>: done`, every runnable story `done`, and
a clean worktree. Commit the Epic status/review record if it is uncommitted,
then report all implementation/status commits and Epic Review outcome.

## Recovery And Escalation

For a failed stage, inspect the worker output, git state, story artifact, and
sprint entry. Make at most one narrowly scoped recovery worker that receives the
exact failure evidence and may repair only the current stage. Re-verify the
same completion conditions afterward. Never use recovery to start a different
story, absorb unrelated changes, invent approval, bypass a required review, or
force a status transition.

After every successful verification or recovery, immediately select and execute
the next permitted stage for the same epic. Do not pause to summarize progress,
request confirmation, or wait for the user merely because a worker completed,
went idle, exited, or produced an incomplete report. Continue until the epic is
done or one of the escalation conditions below is evidenced.

Escalate only after the one recovery attempt fails, authoritative artifacts
conflict, credentials or an external dependency are unavailable, a destructive
operation is required, or a decision-needed/high-risk review finding cannot be
resolved from the story. Report the evidence, safe options, and the exact
decision needed. On success, close every pane recorded by this run one at a
time.
