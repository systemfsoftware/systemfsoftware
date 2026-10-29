# Jev checklist: keep, merge or drop one CI check

Run at review or audit time, never as a CI job (ci-workflows, ci-never-grades-the-repository-itself.md). This file informs the reviewer and gates nothing. Rulings are enforced through PR review and existing packs.

## Status

Not calibrated. A trial on ten checks found three wrong verdicts and eight ending in `person`. Do not hand verdicts to reviewers until the calibration under "Before it informs anything" passes.

This checklist grades other repositories' CI. An audit of a repository's own CI goes to the review judge, not this classifier (ci-workflows, ci-never-grades-the-repository-itself.md: no LLM judge, calibration set or recorded judge output is added to grade the repository's own code, layout or changes).

## Layering

Jev makes atomic judgments; code computes the decision. Counting, arithmetic, label comparison, and lookups stay in code ("Run deterministic validation before LLM judgment", agent-skills skills/evaluation/SKILL.md:34). Gather code facts first, ask one two-label question per judgment, and compute the boolean verdict in code. A Choice always picks an option, so pair it with a Noul (yes/no) confirming whether any option fits.

## Applicability gate (before Q1)

If a check matches multiple kinds, evaluate the producer test before the gate test.

| `kind`          | Code test                                                                     | Where it goes                                                                                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| gate            | Triggers include `pull_request` or `merge_group`, and job result is a verdict | Q1-Q7 and verdict rows                                                                                                                                                                                                      |
| scheduled audit | Trigger is `schedule`                                                         | Q1-Q7 and verdict rows, plus `consecutive_failures` and `last_green`                                                                                                                                                        |
| automation      | Trigger is `workflow_run` (remediation, reporting, e.g. timing report)        | Not graded by Q1-Q7. Compare `runs` (status-filtered, 30 days) to `actions_taken` (job did its task, e.g. rerun requested, comment posted). If `actions_taken` = 0, verdict is `drop`. Otherwise `person` with both counts. |
| producer        | Another job reads output (`needs:`, artifact, reusable workflow input)        | Not graded by Q1-Q7. Check `output_read` and `removal_breaks_reader` (reader resolves input without this job). Both true: `keep`. `output_read` false: `drop`. Reader tolerates absence: `person`.                          |

## Code facts (gathered by tooling, no Jev call)

The GitHub Actions runs API caps unfiltered `total_count` at 2,500 and pagination at 1,000 runs. Query `runs` with status-filtered counts per created-date window (`status=` and `created=>=DATE`), never unfiltered totals. Key jobs by YAML job ID plus lane ID, not display name.

| Fact                                                                                                                                                                                                | Source                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `labels`, `triggers` (with event `types`), `secrets`, `permissions`                                                                                                                                 | Workflow YAML                                |
| `required`                                                                                                                                                                                          | Branch ruleset or protection API             |
| `hides_failure`: `continue-on-error: true`, `\|\| true`, or an exit-zero flag on the verdict step (the final tool step). Excludes optional setup steps. Jobs documented as warning-only rely on Q4. | Regex on YAML                                |
| `runs`, `failures` over 30 days                                                                                                                                                                     | Actions runs API, status-filtered per window |
| `rerun_flips`: failed, then passed on rerun of same SHA, excluding jobs with `rerun_expected` in error text                                                                                         | Runs and jobs API, error text                |
| `defect_flips`: `rerun_flips` where Q6 marks failure log `change_defect` and failed step is not setup                                                                                               | Code plus Q6                                 |
| `infra_flips`: `rerun_flips` not classified as `defect_flips` (setup, checkout, cache, install steps)                                                                                               | Jobs API steps                               |
| `log_available`: per failure, false on HTTP 410 (expired logs)                                                                                                                                      | Logs API                                     |
| `failed_without_steps`: failed jobs with empty steps list (counted as infra without log)                                                                                                            | Jobs API                                     |
| `p50_steps`, `p75_steps`, `p50_wait` (created to started), `p75_wait`, `p50_setup`, `p75_setup`                                                                                                     | Jobs API step timings                        |
| `peers`: other jobs running the same tool binary or reading overlapping paths                                                                                                                       | YAML across repository                       |
| `peer_same_triggers`, `peer_paths_cover`: whether peer runs on every trigger of this check and over same or wider paths                                                                             | YAML comparison                              |
| `host`: fast-checks job with matching labels, secrets, and permissions. Compared per job, not workflow; missing event types resolve via `if:`                                                       | YAML comparison                              |
| `suppressions`: suppression comments (e.g. `oxlint-disable`, `eslint-disable`, `biome-ignore`, `ts-expect-error`)                                                                                   | Grep                                         |
| `config_only_fixes`: failed PR runs whose next green commit changed only check config, allowlists, or suppressions                                                                                  | Git plus runs API                            |
| `consecutive_failures`, `last_green` (scheduled audits only)                                                                                                                                        | Runs API                                     |

## State (named JSON fields, only what the questions need)

Schemas:

- `check`: `{ workflow_file, job_id, lane_id, job_yaml, step_names, tool_config_excerpt, introducing_commit_message }`
- `peer`: `{ job_id, job_yaml, tool_config_excerpt }`
- `failure`: `{ sha, step_name, log_excerpt }`

`log_excerpt` is the first `##[error]` line plus the 20 lines preceding it. Do not use an 80-line tail; tail logs often capture secondary step failures rather than root causes.

Use semantic names, not raw IDs. Omit unused fields (https://docs.typesafe.ai/go/jaggedness.md).

- Request A bundles Q1-Q3 over `check`.
- Q4 runs only when `hides_failure` is false.
- Request B runs once per peer (Q5).
- Requests C and D run per sampled failure (Q6, Q7).
- Prepend each prompt: "Judge only from the provided state".

Failure sampling: group failures by root cause (failed step name plus normalized first error line). Sample the most recent failure from up to 10 distinct groups. Do not sample purely by recency. Failures with `log_available: false` are excluded from sampling. If no failure has a log, Q6 and Q7 return `unclear`.

## Questions

| Id                           | Type          | Question                                                                                                                                                                                                                                                                                                                                                                                                     | Yes criteria                                                                                                                                                                                                                                                  | No criteria                                                                         |
| ---------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Q1 `names_defect`            | Noul          | Do the job's comments, step names, tool config or introducing commit message name a kind of defect that this check finds?                                                                                                                                                                                                                                                                                    | Names a defect class: type error, lint violation, format violation, failing test of shipped behaviour, commit message violation (commitlint), committed secret, broken link, invalid schema. The words lint, typecheck, test, format, and commitlint qualify. | Vague word ("validate", "check", "run") or unstated.                                |
| Q2 `guards`                  | Choice        | What does this check examine? Options: `product source or types`, `behaviour of shipped code under test`, `secrets or security of the product`, `the deploy or release artifact`, `commit messages or changesets the release reads`, `formatting of the product's code`, `the repository's own docs, plans or packs`, `workflow files`, `none of these: CI infrastructure (timings, retries, cache warming)` | —                                                                                                                                                                                                                                                             | —                                                                                   |
| Q3 `guards_fits`             | Noul          | Does any one of the Q2 options describe what this check examines?                                                                                                                                                                                                                                                                                                                                            | One option clearly fits.                                                                                                                                                                                                                                      | None fits, or the check inspects unrelated concerns.                                |
| Q4 `finding_fails_job`       | Noul          | When the tool reports a finding, does the job fail? (Asked only when `hides_failure` is false.)                                                                                                                                                                                                                                                                                                              | Tool exits non-zero on findings; findings are not demoted to warnings.                                                                                                                                                                                        | Tool sets rules to warn, uses report-only mode, or only posts annotations/comments. |
| Q5 `peer_covers`             | Noul          | Does the peer's rule set cover this check's defect class?                                                                                                                                                                                                                                                                                                                                                    | Peer runs the same tool or a superset of rules.                                                                                                                                                                                                               | Peer inspects a different defect class.                                             |
| Q6 `failure_cause`           | Choice + Noul | Which fits this failure log? Options: `change_defect` (finding in changed code, config, or message), `infra` (network timeout, runner loss, rate limit, job cancellation, tool crash, setup step), `repo_state` (state not caused by change, e.g. red main branch, or false positive on merge-queue draft).                                                                                                  | —                                                                                                                                                                                                                                                             | —                                                                                   |
| Q7 `fails_on_correct_change` | Noul          | Does this failure fire on a change that is correct, because the check enforces an arbitrary requirement?                                                                                                                                                                                                                                                                                                     | Fixed by editing check config, allowlist, or suppression rather than code, or enforces arbitrary syntax/layout.                                                                                                                                               | Finding identifies a real defect in the change.                                     |

Sources:

- "Brittle tests fail when an arbitrary test requirement or invariant is violated, without there necessarily being a fundamental connection between that invariant and the correctness of the software" (https://abseil.io/resources/swe-book/html/ch23.html).
- `agent-skills skills/evaluation/SKILL.md:243 ("Overfitting evals to specific code paths ... surface patterns")`.

## Reading answers

A label matches when its probability is >= 0.7 with a margin >= 0.1 over runner-up. Lower confidence, timeouts, or refusals resolve to `unclear`. Pin explicit model IDs: "If you have tuned confidence thresholds against one version, send that version's ID instead of the alias" (https://docs.typesafe.ai/go/models.md).

Derived counts over sampled failures:

- `caught = count(Q6 change_defect)`
- `infra = count(Q6 infra) + failed_without_steps`
- `by_design = count(Q6 repo_state)` (never added to `infra`)
- `brittle = count(Q7 yes)`

## Verdict (code, walk rows in order)

Evaluate rows 2 to 11 in order. First matching row fires. If an evaluated row reads an `unclear` answer, stop and return `person`. Earlier matching rows take precedence. Only gates and scheduled audits reach this table.

| Row | Condition                                                                                                                                                                           | Verdict                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | Walk rules above                                                                                                                                                                    | n/a                                                                                                                   |
| 2   | Q2 = `the repository's own docs, plans or packs` (ci-never-grades-the-repository-itself.md)                                                                                         | `drop`                                                                                                                |
| 3   | Q3 = no                                                                                                                                                                             | `person`: split the job                                                                                               |
| 4   | `hides_failure` or Q4 = no                                                                                                                                                          | `drop`, unless Q2 is security, release, or behaviour; then `person`                                                   |
| 5   | Peer has Q5 = yes, `peer_same_triggers`, and `peer_paths_cover`                                                                                                                     | `drop` (keep peer; if peer covers this check, keep the job with lower `p50_steps`)                                    |
| 6   | `infra_flips` >= 1 and `caught` = 0                                                                                                                                                 | `keep`; repair runner or setup step                                                                                   |
| 7   | `defect_flips` >= 1                                                                                                                                                                 | Quarantine from required checks (Fowler, nonDeterminism), unless Q2 is security, release, or behaviour; then `person` |
| 8   | `brittle` >= 1 and `brittle` >= `caught`                                                                                                                                            | `drop` or rewrite; if Q2 is security, release, or behaviour: `person`                                                 |
| 9   | Q1 = no and `caught` = 0 and Q2 is not security, release, or behaviour                                                                                                              | `drop`                                                                                                                |
| 10  | `host` exists, `p75_steps` <= 0.75 * (`p75_wait` + `p75_setup`), and host `p75_steps` + check `p75_steps` <= 0.75 * 10 min (a-check-gets-its-own-runner-only-for-a-named-reason.md) | Merge into `host` as a step. If host lacks timing history, do not fire; note "measure the host first".                |
| 11  | Otherwise                                                                                                                                                                           | `keep`. Note: if gate `p50_steps` > 10 min, flag "split or shard".                                                    |

Reviewer note for scheduled audits: if `consecutive_failures` and `last_green` indicate red status for N days without check modifications, report "red and not acted on for N days".

## Worked example: merging commit lint into host job

A commit lint workflow listens for `edited` (PR title updates), whereas default workflow triggers do not (https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).

Merge steps:

1. Add `edited` to the host workflow `pull_request` types.
2. Add `if: github.event.action != 'edited'` to all host jobs except the host check.
3. Add `if: github.event.action != 'edited'` to host lint and typecheck steps.
4. Title edits run only the commit-lint step on the host runner. Skipped jobs report success, preserving required status checks (https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions).
5. Run steps checking commit trailers with `if: success()` or guard after install so install failures do not misattribute errors to commits. Failures on merge-queue drafts are check false positives (Q6 `repo_state`).

## Before it informs anything

Label at least 20 kept and 20 dropped checks from real repositories. Report held-out true-positive and true-negative rates with `unclear` counted as an error. Select confidence thresholds by `max min(TPR, TNR)`. Hand verdicts to reviewers only when TPR and TNR are both >= 0.8.

Prompt text is version-controlled. Rerun calibration on any question modification: "Minor wording changes in evaluation prompts can cause material score swings" (agent-skills skills/advanced-evaluation/SKILL.md:369; "Rubric drift" at :367).

Regression suite: maintain ten real checks spanning kind categories (commit lint gate, timing report automation, retry automation, lint/typecheck gate, long test gate, deploy gate with `rerun_expected`, scheduled cache audit, timing producer, typecheck gate, push-probe automation). Verify expected verdicts after any file change.

Cost model: $0.042 per million input tokens, output free (https://docs.typesafe.ai/go/models.md). A check with 2 peers and 10 sampled failures takes 23 total requests (1 + 2 + 20) with Q6 and Q7 evaluated separately.
