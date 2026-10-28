---
title: A check gets its own job, and so its own spot runner, only for a named machine, trust, trigger or time reason; otherwise it is a step in an existing job
applies_when:
  - adding a job or matrix leg to a workflow, or splitting a step out into its own job
  - adding a small check such as commitlint, a format check, a link check or a script to CI
  - consolidating jobs so a workflow uses fewer runners
tags: [ci, runners, jobs, spot, cost]
---

Every job is a fresh runner. On the fleet each runner "executes exactly one job, and terminates" (github-selfhosted-runner ARCHITECTURE.md:7). So each job pays a spot launch, a boot, its own checkout and its own install. Steps on one runner share that setup: "Since each step is executed on the same runner, you can share data from one step to another" (https://docs.github.com/en/actions/get-started/understand-github-actions).

Step 0. A judgment-shaped question is not a CI job on any runner. Judgment calls belong to a blocking review rule plus an AGENTS.md instruction, and a mechanical gate is added only when it is not brittle (engram #809, Learned). Questions about the repository itself go to the review judge (ci-workflows, ci-never-grades-the-repository-itself.md:14).

A mechanical check that the change adds or moves gets its own job only when one of these reasons holds, and the job carries the reason as a YAML comment:

1. Machine. It needs runs-on labels the existing job's runner lacks: architecture, kvm or size. A missing tool is not a machine need. The step fetches the tool pinned, because no tools are baked into the runner image (owner, "thats massively coupling", engram #781).
2. Trust. It needs a secret, write permission or environment that the other job must not hold ("make sure that the GITHUB_TOKEN is granted the minimum required permissions", https://docs.github.com/en/actions/reference/security/secure-use).
3. Trigger. It runs on a different event, or merging it renames its check. Merging jobs changes the check names, so the Mergify merge_conditions and the "main" ruleset change in the same PR, or every queue draft waits on a check that never reports (younna-ai .mergify.yml:2; a skipped workflow leaves checks "Pending", https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions).
4. Time. Its steps take longer than a fresh runner's wait plus setup, or folding it in would push the job past ten minutes. Before a separate runner, the work runs as parallel steps in the existing job (`jobs.<job_id>.steps[*].parallel`: "Runs a group of steps concurrently, then waits for all of them to finish", same workflow-syntax page), once a lane confirms that the fleet runner image's actions/runner version supports it. That version was not read for this pack. Use fleet data rather than a guessed wait: younna-ai PR median 594 s, of which 275 s is waiting for runners (engram #780). Fowler: "the XP guideline of a ten minute build is perfectly within reason" (https://martinfowler.com/articles/continuousIntegration.html). The comparison is derived from these sources, not quoted.

Failure isolation alone is not a reason. A separate named step already reports which check failed (ci-workflows, failures-are-visible-and-reproducible.md).

A check that is folded into an existing job has its tool arrive with that job's frozen install or the job's one pinned tool fetch. Otherwise it breaks ci-workflows, pull-request-jobs-check-after-a-frozen-install.md:9 (see README, Known conflicts).

Worked examples:
- commitlint has no machine, trust or time reason, so it is a step in the fast-checks job. Its trigger differs in event type only: commitlint.yml:6 listens for `edited` (PR title edits) and ci.yml's default pull_request types do not (https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows). An event-type difference is resolved with `if:` inside the shared workflow, not with a new job (see jev/ci-check-verdict.md, Worked example). The owner ruled: "it should be on the same runner whete all the fast chrcks run" (engram #789; YOU-1121, SYS-837). Where changeset-check runs waits on the owner (engram #789).
- A suite that runs only on mergify/merge-queue/* drafts gets its own job (reason 3).
- A deploy that holds cloud credentials gets its own job (reason 2).
- A VM test that needs kvm gets its own job (reason 1).

Consequence: every unneeded job adds one spot runner to every run of its workflow and uses registration capacity, since the fleet "spaces JIT registrations to at most 75 per minute" (github-selfhosted-runner ARCHITECTURE.md:59). younna-ai ran about 2,500 workflow runs in 24 hours (engram #831 baseline). Under action-class-rubric.md this is a performance regression (P2).

Gate: judge
