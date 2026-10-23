---
title: Every independent CI check runs and reports under its own name, and the success messages around it are not evidence
applies_when:
  - adding or changing a CI gate, a check script or a workflow step that runs more than one check
  - chaining checks with `&&`, folding several tasks into one invocation or adding a run-wide flag
  - adding a CI-only or local-only condition to a diagnostic step, a cache key, an annotation emitter or a report directory
  - a failing log ends in "exit code 1" with no line naming the check that failed
tags: [ci, failures, annotations, diagnostics, cache, workflows, legibility]
---

A CI gate has two outputs: a pass or fail bit, and a description of what broke. A gate that chains its checks loses the description: the first failure stops the chain, every later check reports nothing, and the platform names the launcher instead of the check. `failures-name-the-gate-and-location` decides what a failing job writes; this rule decides what has to be true for the failing check to be named at all.

## Rule

Every independent check runs and reports its outcome under its own name, whichever check failed first, and the gate's reporting is proven by a forced failure or a measured effect, never by a green run or a platform success message.

- **No `&&` between independent checks.** Each independent check is its own named step or task. `&&` joins only a producer to a consumer that reads its output. A formatter chained before a linter exited 20, the linter never ran, and an 1812-line log ended in a bare "process completed with exit code 1".
- **A run-wide flag is not a task's flag.** A task that needs its own flags (a machine-readable formatter) keeps its own bounded invocation. Folding it into a multi-task invocation applies the flag to every task or to none, and a native annotation emitter disappears with no error.
- **No diagnostic behind an environment condition.** Every diagnostic the gate claims to run is installed and run in the gate's own environment. A step too slow for CI is its own named phase, not a conditional on a CI variable. A type-checker plugin applied only when the CI variable was unset left a genuine floating-effect defect in committed source invisible to the gate.
- **A resource kill is named from outside the task.** An OOM-killed or timed-out task writes nothing of its own, so the gate reports the terminating signal and the resource ceiling beside the exit code. CI concurrency is full utilisation; per-task worker pools and heap are bounded instead of capping the task graph fractionally.
- **Annotations are a capped index.** Annotations are budgeted against the platform's per-step cap, the highest-value ones are emitted, and one notice names how many were omitted and where the full set lives. A reader never concludes the run had exactly cap-many failures.
- **A structured artifact carries the failures.** The gate writes one schema-versioned machine-readable document listing every failing unit with its identifier, package, exit code and a reproduce command, so no reader parses the human log.
- **Branch logic lives in a committed script.** Workflow YAML stays declarative: environment, one script invocation, one redirect. Loops, conditionals and string assembly live in a committed script with a local test, because logic only a runner can reach is never tested.
- **A cache key follows the source.** A key built from config-file hashes alone restores successfully forever and never changes, because the store never overwrites an existing key. The key carries a per-commit component with `restore-keys` as the fallback prefix, and the cache's effect is the task-level hit count read from the run, never the restore log line.
- **Report directories start empty.** The directory the gate writes run reports into is deleted as the first gate step, and the reader keeps only the newest record per command, so a stale record restored from a cache never reads as a current failure.

Evidence. A cache key built from two config-file hashes restored on every run and produced zero task hits; a per-commit component with a prefix fallback took the run to a large majority of hits. A run-report directory restored from cache held two records for one command, so the same failure annotation appeared twice and the task total summed across both runs. Consolidating a lint task into a shared multi-task invocation would have applied the lint formatter flag to the type-checker as well, and deleting the task's own script silently dropped its annotation emitter until a planted rule violation showed the loss.

Gate: `review` and `fact`. Does the diff chain independent checks with `&&`, fold a task that needs its own flags into a shared invocation, gate a diagnostic on a CI variable, key a cache on config hashes alone or leave a report directory uncleared? `fact` — A forced failure in the first check of the gate leaves every later check reporting under its own name, a planted real violation produces an annotation with file, line and column, a run with more failures than the annotation cap shows the cap's worth plus a notice naming the omitted count, and a second run after a fix contains no record from the first.
