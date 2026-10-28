---
title: A CI check exists only to catch a defect in what the repository ships, never to grade the repository's own docs, plans, layout or changes
applies_when:
  - adding a CI job, task, script, hook or test, or changing what one checks
  - adding an LLM judge, calibration data or a recorded judge output
  - committing screenshots, run logs or judge verdicts as proof that a change works
tags: [ci, self-grading, judges, evidence, checks]
---

Every check CI runs fails on a defect that a user or consumer of something the repository ships would meet: a package, an app, a service, a tool the repository publishes.

No CI job, task, script, hook or test has the repository's own docs, plans, rule packs, file layout, CI timings or CI cost as its subject. A check of a tool the repository ships, run against a planted violation, tests that product and is allowed.

No LLM judge, calibration set or recorded judge output is added to grade the repository's own code, layout or changes; that judgment belongs to review. No screenshot, run log or judge verdict is committed as proof that a change works; proof goes in the pull request.

Decision test: for each check the diff adds or changes, name one defect a user or consumer of a shipped artifact would meet that makes this check fail. The diff fails when no such defect can be named because the check's subject is the repository's own docs, plans, packs, layout, timings or changes, or when it commits a judge, a calibration set or a proof file.

Defect prevented: a check that grades the repository itself spends runner time on every run and catches nothing a user would meet. When it fails, the failure is noise that teaches people to ignore red checks. Committed proof goes stale with the next change, yet it still reads as current.

```yaml
# WRONG: grades the repository's own documents
- name: plans have a dated header
  run: node scripts/check-plan-headers.mjs docs/plans
```

```yaml
# RIGHT: tests a lint rule the repository publishes against a planted violation
- name: the published lint rule rejects a planted violation
  run: pnpm --filter ./packages/lint-rules test
```

Source: Sadowski et al., "Lessons from Building Static Analysis Tools at Google", Communications of the ACM 61(4), 2018: "If a tool wastes developer time with false positives and low-priority issues, developers will lose faith and ignore results" (https://research.google/pubs/lessons-from-building-static-analysis-tools-at-google/). Keeping judgment of the repository's own work in review, not in CI, is this pack's ruling.

Gate: judge
