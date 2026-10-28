# Jev checklist: keep, merge or drop one CI check

This file is storage: discovery never reads it as a rule. Run it at review or audit time, never as a CI job, because a CI job must not grade the repository's own config (ci-workflows, ci-never-grades-the-repository-itself.md). It informs the reviewer and gates nothing. Rulings are enforced through PR review and existing packs, not new gates.

## Status

Not calibrated. A first informal trial on ten checks found three of ten fired verdicts wrong and eight of ten ending in `person`; the fixes below address that and have not been rerun. Until a labelled regression set passes and the calibration under "Before it informs anything" is done, do not hand verdicts from this file to reviewers.

A labelled set and classifier for this checklist grade other repositories' CI. An audit of a repository's own CI goes to the review judge, not to this classifier (ci-workflows, ci-never-grades-the-repository-itself.md: no LLM judge, calibration set or recorded judge output is added to grade the repository's own code, layout or changes).

## Layering

Jev makes atomic judgments and code makes the decision. Counting, arithmetic, label comparison and exact lookups stay in code ("Run deterministic validation before LLM judgment", agent-skills skills/evaluation/SKILL.md:34). The pattern: gather code facts first, ask one two-label question per judgment, and compute the boolean verdict in code. A Choice always picks an option, even when nothing fits, so pair it with a Noul (a yes/no question) that says whether any option fits.

## Applicability gate (before Q1)

Code derives `kind` from the job's triggers and from `needs` and artifact reads across the workflows:

| `kind` | Code test | Where it goes |
|---|---|---|
| gate | triggers include `pull_request` or `merge_group`, and the job's result is a verdict | Q1-Q7 and the verdict rows |
| scheduled audit | trigger is `schedule` | Q1-Q7 and the verdict rows, plus `consecutive_failures` and `last_green` |
| automation | trigger is `workflow_run` (remediation, reporting, for example a timing-report workflow that runs after every run) | not graded by Q1-Q7. Code reports `runs` (status-filtered, 30 days) against `actions_taken` (runs whose job did the thing it exists for, for example a rerun requested, a comment posted). `actions_taken` = 0 over the window gives `drop`. Anything else gives `person` with both numbers. |
| producer | another job reads its output (`needs:`, or an artifact or input it writes, for example a `record` input of a reusable workflow) | not graded by Q1-Q7. Code fact `output_read`, and `removal_breaks_reader` (the reader still resolves its input without the job). Both true gives `keep`. `output_read` false gives `drop`. A reader that tolerates absence gives `person`. |

A check that fits two kinds takes the producer test first, then the gate test. The first trial dropped four automation and producer jobs as bad checks only because they were not checks.

## Code facts (gathered by tooling, no Jev call)

Facts carry their limits. The Actions runs API caps an unfiltered `total_count` at 2,500 and pagination at 1,000 runs, so an unfiltered total undercounts a busy workflow. `runs` is therefore specified as status-filtered counts per created-date window (`status=` plus `created=>=DATE`), never an unfiltered total. Jobs are keyed by YAML job id plus lane id, never by display name, because names of matrix legs vary per plan.

| Fact | Source |
|---|---|
| `labels`, `triggers` (with event `types`), `secrets`, `permissions` of the job | workflow YAML |
| `required` | branch ruleset or protection API |
| `hides_failure`: `continue-on-error: true`, `\|\| true` or an exit-zero flag on the step that produces the verdict (the last step that runs the tool). An optional input step such as an artifact download is not the verdict step. A report-only-by-design job (a step documented as "a warning, never a failure") escapes this regex and relies entirely on Q4. | regex on YAML |
| `runs`, `failures` over 30 days | Actions runs API, status-filtered per window |
| `rerun_flips`: failed, then passed on a rerun of the same sha, excluding jobs with `rerun_expected` (the job's own error text tells the user to rerun) | runs and jobs API, error text |
| `defect_flips`: the `rerun_flips` whose failure log Q6 marks `change_defect` and whose failed step is not a setup step | code plus Q6 |
| `infra_flips`: the `rerun_flips` that are not `defect_flips`. The step split treats setup, checkout, cache and install steps as infra | jobs API steps |
| `log_available`: per failure, false on HTTP 410 (routine: logs expire) | logs API |
| `failed_without_steps`: failures where the job concluded `failure` with an empty steps list. Counted as infra without a log | jobs API |
| `p50_steps`, `p75_steps`, `p50_wait` (created_at to started_at), `p75_wait`, `p50_setup`, `p75_setup` (checkout and install steps) | jobs API step timings |
| `peers`: other jobs that run the same tool binary or read overlapping paths | YAML of every workflow in the repo |
| `peer_same_triggers`, `peer_paths_cover`: per peer, whether it runs on every trigger of this check and over the same or wider paths | YAML compare |
| `host`: the fast-checks job with the same labels, secrets and permissions, if any. Event types are compared per job, not per workflow: a type this check needs and the host lacks (for example `edited`) does not disqualify the host. It is resolved by an `if:` (see Worked example) | YAML compare |
| `suppressions`: suppression comments for this check's rules (oxlint-disable, eslint-disable, biome-ignore, ts-expect-error and similar markers) | grep |
| `config_only_fixes`: failed PR runs whose next green commit changed only the check's config, allowlist or suppressions | git plus runs API |
| `consecutive_failures`, `last_green` (scheduled audits only) | runs API |

## State (named JSON fields, only what the questions need)

`check`: { `workflow_file`, `job_id`, `lane_id`, `job_yaml`, `step_names`, `tool_config_excerpt`, `introducing_commit_message` }; `peer`: { `job_id`, `job_yaml`, `tool_config_excerpt` }; `failure`: { `sha`, `step_name`, `log_excerpt` }. `log_excerpt` is the first `##[error]` line plus the 20 lines before it. A last-80-lines tail can miss the cause: a later step may print an `##[error]` line for the commit after an install failure, so the tail shows commits, not the cause.

Use names, not raw IDs. Leave out fields no question reads, because large state full of irrelevant detail degrades answers (https://docs.typesafe.ai/go/jaggedness.md). Request A bundles Q1-Q3 over `check`. Q4 is asked only when `hides_failure` is false. Request B is one per peer (Q5). Requests C and D are one per sampled failure (Q6, Q7). Each request starts with "Judge only from the provided state".

Failure sampling: group failures with a log by distinct root cause (failed step name plus the normalised first error line) and take the most recent failure of each of up to 10 groups. Sampling by recency alone can give caught = 0, because the newest failures may all be one network incident. A failure with `log_available` false is not sampled, not `unclear`. If no failure has a log, Q6 and Q7 are `unclear` for the check.

## Questions

| Id | Type | Question | yes criteria | no criteria |
|---|---|---|---|---|
| Q1 `names_defect` | Noul | Do the job's comments, step names, tool config or introducing commit message name a kind of defect that this check finds? | A defect class is named: type error, lint violation, format violation, failing test of shipped behaviour, commit message violation (commitlint), committed secret, broken link, invalid schema. The words lint, typecheck, test, format and commitlint each count as a defect class. | Only a vague word is named ("validate", "check", "run"), or nothing is stated. |
| Q2 `guards` | Choice | What does this check examine? Options: `product source or types`, `behaviour of shipped code under test`, `secrets or security of the product`, `the deploy or release artifact`, `commit messages or changesets the release reads`, `formatting of the product's code`, `the repository's own docs, plans or packs`, `workflow files`, `none of these: CI infrastructure (timings, retries, cache warming)` | | |
| Q3 `guards_fits` | Noul | Does any one of the Q2 options describe what this check examines? | One option clearly fits. | None fits, or the check examines several unrelated things. |
| Q4 `finding_fails_job` | Noul | When the tool reports a finding, does the job fail? Asked only when `hides_failure` is false. | The tool exits non-zero on a finding, and no setting makes findings warnings. | The tool config sets rules to warn, uses a report-only mode, or only posts annotations or comments. |
| Q5 `peer_covers` | Noul | Does the peer's rule set cover this check's defect class? | The peer runs the same tool or a superset of its rules. | The peer checks a different defect class. |
| Q6 `failure_cause` | Choice, paired with a Noul | Which fits this failure log? Options: `change_defect` (a finding in the changed code, config or message: a failed assertion, a type error, a rule violation), `infra` (a network or registry timeout, runner loss, rate limit, cancelled job, tool crash, a setup step), `repo_state` (the failure reports a state the change did not cause but the check is meant to report, such as the main branch's deploy being red, or a false positive of the check itself, such as a commit-message lint firing on merge-queue drafts) | | |
| Q7 `fails_on_correct_change` | Noul | Does this failure fire on a change that is correct, because the check enforces an arbitrary requirement? | Yes: the finding is fixed by editing the check's config, an allowlist or a suppression and not the change, or the check enforces a literal or layout detail with no link to correctness. | No: the finding names a real defect in the change. |

Q7 source: "Brittle tests fail when an arbitrary test requirement or invariant is violated, without there necessarily being a fundamental connection between that invariant and the correctness of the software" (https://abseil.io/resources/swe-book/html/ch23.html), and agent-skills skills/evaluation/SKILL.md:243 ("Overfitting evals to specific code paths ... surface patterns").

Q1 also covers the boundary case where a check's name looks like a defect ("security-scan") but its config only prints a report. In that case Q4 decides.

## Reading answers

A label matches only when it leads with probability >= 0.7 and its margin over the runner-up is >= 0.1. Anything short of that is `unclear`, and so is a refusal or a timeout. These thresholds are a starting point and are re-chosen at calibration. Pin the exact model ID rather than an alias, because aliases move: https://docs.typesafe.ai/go/models.md says "If you have tuned confidence thresholds against one version, send that version's ID instead of the alias".

Derived counts (code, over sampled failures): `caught = count(Q6 change_defect)`, `infra = count(Q6 infra) + failed_without_steps`, `by_design = count(Q6 repo_state)`, `brittle = count(Q7 yes)`. `by_design` is never added to `infra`.

## Verdict (code, walk the rows in order)

Row 1 is the rule for walking: test rows 2 to 11 in order. The first row whose condition is true fires. A row whose condition reads an `unclear` answer ends the walk with `person` (a reviewer decides). Rows earlier than that row that fire still win, and answers a row does not read never matter. Only gates and scheduled audits reach this table.

| Row | Condition | Verdict |
|---|---|---|
| 1 | walk rule above | n/a |
| 2 | Q2 = `the repository's own docs, plans or packs` (ci-never-grades-the-repository-itself.md) | drop |
| 3 | Q3 = no | person: split the job |
| 4 | `hides_failure` or Q4 = no | drop, unless Q2 is security, release or behaviour, then person |
| 5 | some peer has Q5 = yes and `peer_same_triggers` and `peer_paths_cover` | drop (the peer stays; if the peer also covers this one, keep the one with the lower `p50_steps`) |
| 6 | `infra_flips` >= 1 and `caught` = 0 | keep; fix the runner or the setup step |
| 7 | `defect_flips` >= 1 | quarantine from the required set (Fowler, nonDeterminism), unless Q2 is security, release or behaviour, then person |
| 8 | `brittle` >= 1 and `brittle` >= `caught` | drop or rewrite; if Q2 is security, release or behaviour, person |
| 9 | Q1 = no and `caught` = 0 and Q2 is not security, release or behaviour | drop |
| 10 | `host` exists, and `p75_steps` <= 0.75 * (`p75_wait` + `p75_setup`) and host `p75_steps` + this check's `p75_steps` <= 0.75 * 10 min | merge into `host` as a step. With no host p75 (the host has no history), the row does not fire and the note says "measure the host first". |
| 11 | otherwise | keep. Note: if `p50_steps` > 10 min on a gate, add "split or shard" |

Row 10 needs a 25% margin on both sides because medians measured to the second can be knife-edge (a step median of 57 s against wait plus setup of 56 s is no difference). A difference under one measurement unit counts as no merge.

Rows 4, 7 and 8 keep the carve-out: checks that guard security, secrets, types, tested shipped behaviour or the deploy go to a person, never to drop, because assuming checks are good or bad without reading them is the error this checklist exists to avoid. Row 10 is the time test from a-check-gets-its-own-runner-only-for-a-named-reason.md.

Reviewer notes, not verdicts: for a scheduled audit, if `consecutive_failures` and `last_green` show it red for N days with no change to the check, say "red and not acted on for N days". Whether that means a real open finding or a broken check is for a person.

## Worked example: a commit-message lint into the fast job

A commit-message lint workflow listens for `edited` (PR title edits), and the main CI workflow's default pull_request types do not (https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows). Decision: add `edited` to the CI workflow's pull_request `types`, put a job-level `if: github.event.action != 'edited'` on every job except the host, and put the same `if:` on the host's lint and typecheck steps. So a title edit starts one runner, the host, which runs only the commit-message step, the same single runner the standalone workflow used. The alternative of letting every title edit rerun all of CI costs a full run per edit. A skipped job reports success, so the required check set is unchanged (https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions).

Two details. A step that checks commit trailers and runs with `if: !cancelled()` should run only when the install step succeeded, or it prints an `##[error]` line for every commit after an install failure. And if most of the lint's failures are on merge-queue drafts, that is a false positive of the check, fixed in the check; it is Q6 `repo_state`, which the first trial could not express.

## Before it informs anything

Label at least 20 kept and 20 dropped checks from real repositories. Report held-out true-positive and true-negative rates with `unclear` counted as an error in both. Choose thresholds by max min(TPR, TNR). Hand verdicts to reviewers only when both are >= 0.8. Question sets for similar routing tasks have failed exactly this step (a held-out TNR of 0.78 on 18 negatives), so do not skip it. The 20+20 label count is a choice made here, not a sourced number. The question texts above are version-controlled, and the calibration reruns whenever a question changes: "Minor wording changes in evaluation prompts can cause material score swings" (agent-skills skills/advanced-evaluation/SKILL.md:369; "Rubric drift" at :367).

Regression set: keep a set of about ten real checks covering each kind (a commit-message lint gate, a timing-report automation, a retry automation, a lint-and-typecheck gate, a long test gate, a deploy gate with `rerun_expected`, a scheduled cache audit, a timing producer read by a planner, a typecheck gate, a push-probe automation) with the expected verdict written down, and rerun it after every change to this file.

Cost: list price is $0.042 per million input tokens, with output free (https://docs.typesafe.ai/go/models.md). A check with 2 peers and 10 sampled failures takes 1 + 2 + 20 = 23 requests with Q6 and Q7 asked separately.
