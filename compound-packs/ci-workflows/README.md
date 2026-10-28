Which event runs which suite, when a check gets its own job, how a pull-request job is set up, how actions and tools are pinned, who writes the cache, how a run is cancelled or skipped without hiding a required check, how long a job may run, how a failure is reported and reproduced, what the pre-push command runs, and which checks CI never runs.

`jev/ci-check-verdict.md` is storage, not a rule; discovery does not read a subdirectory as a rule. It holds a Jev checklist that classifies one existing check as keep, merge or drop, for audits. It is not calibrated yet and is not ready to hand verdicts to reviewers.

Where a rule names a queue tool's branch prefix, it is an example for a repository that queues through draft pull requests; a repository with a GitHub merge queue uses the `merge_group` event instead.
