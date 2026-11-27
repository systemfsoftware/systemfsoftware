# Graders

Read this when building or editing a grader (lint rule, CI job, hook, threshold,
or rubric). `SF-GATE-2` and `SF-GATE-5` in `CODING_STANDARDS.md` also apply.

- **SF-GATE-1** Enforce each obligation with the strongest available mechanism:
  type system first, failing command second, pre-call refusal third, prose
  documentation last.
- **SF-GATE-3** Assert that the grader's input set is non-empty; treat an empty
  corpus, empty file list, or missing input as a failure.
  - Why: a grader that cannot fail is a certificate, not enforcement.
- **SF-GATE-4** Determine which graders, tests, and requirements apply to code
  by what it is and does, never its name or file path.
  - Why: relying on names or paths causes a rename or move to drop a requirement
    or apply it to the wrong code.
- **SF-GATE-6** Enable a new grader rule at error severity over a clean tree by
  fixing all existing violations first, without baselines, allowlists, or
  warning levels.
  - Why: baselines are temporary suppression, and warnings are noise nobody
    reads.
