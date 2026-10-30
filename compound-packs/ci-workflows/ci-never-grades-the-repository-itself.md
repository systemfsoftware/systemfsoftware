---
title: CI checks catch defects in shipped artifacts and never grade the repository itself
applies_when:
  - adding a CI job, script, hook or test, or changing what one checks
  - adding an LLM judge, calibration data or a recorded judge output
  - committing screenshots, run logs or judge verdicts as proof that a change works
  - auditing, consolidating or removing existing checks
tags: [ci, self-grading, judges, evidence, checks, duplicates]
---

A CI check exists to catch a defect a consumer of a shipped artifact (a package, app, service or published tool) would meet. Never add a check that grades the repository's own docs, plans, rule packs, file layout, CI timings or CI cost.

Never duplicate a check: two checks catching the same defect on the same files is one check too many.

Testing a tool the repository ships against a planted violation tests that product and is fine.

Never commit an LLM judge, calibration set, recorded judge output, screenshot or run log to grade or prove the repository's own change. Judgment belongs in review, and proof belongs in the pull request description.

```yaml
# WRONG: grades the repository's own documents
- run: node scripts/check-plan-headers.mjs docs/plans
```
