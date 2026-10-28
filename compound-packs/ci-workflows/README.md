# CI Workflows

This pack covers:

- Which event runs which suite.
- When a check gets its own job.
- Pull request job setup.
- Action and tool pinning.
- Cache write permissions.
- Run cancellation and skipping without hiding required checks.
- Job timeouts.
- Failure reporting and reproduction.
- Pre-push command scope.
- Checks CI never runs.

`jev/ci-check-verdict.md` is storage, not a rule. Discovery ignores subdirectories. It holds an audit checklist to classify existing checks as keep, merge, or drop. It is not calibrated to supply review verdicts.

Queue branch prefix examples apply to repositories that queue through draft pull requests. Repositories with a GitHub merge queue use the `merge_group` event instead.
