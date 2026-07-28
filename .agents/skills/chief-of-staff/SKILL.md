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
  `herdr agent prompt`, `herdr agent wait`, `herdr agent read`, and `herdr pane
  close` before the first Herdr mutation.
- Work strictly sequentially against this checkout. Never start a worker for the
  next stage until the current worker's report and affected files are verified.
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

For each worker, create a new sibling pane, start a uniquely named OpenCode
agent, submit its stage prompt, then wait and inspect its terminal output:

```bash
herdr pane split --current --direction right --cwd "$PWD" --no-focus
herdr agent start <unique-name> --kind opencode --pane <returned-pane-id>
herdr agent prompt <unique-name> "<stage-prompt>"
herdr agent wait <unique-name> --until idle --until done --until blocked --until unknown --timeout 1800000
herdr agent read <unique-name> --source recent-unwrapped --lines 300
```

`idle` is only a lifecycle signal. On `idle`, read the output; if the required
report is absent or says review subagents are still running, wait for the same
worker again. On `blocked`, `unknown`, or timeout, read the worker output and
the relevant artifacts before considering recovery. Do not ask a worker merely
to reprint output while its result is still pending.

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

Escalate after the recovery fails, authoritative artifacts conflict, credentials
or an external dependency are unavailable, a destructive operation is required,
or a decision-needed/high-risk review finding cannot be resolved from the story.
Report the evidence, safe options, and the exact decision needed. On success,
close every pane recorded by this run one at a time.
