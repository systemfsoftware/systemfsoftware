---
title: CI checks catch unique defects in shipped artifacts and never grade the repository itself
applies_when:
  - adding a CI job, task, script, hook or test, or changing what one checks
  - adding an LLM judge, calibration data or a recorded judge output
  - committing screenshots, run logs or judge verdicts as proof that a change works
  - auditing, consolidating or removing existing checks
  - adding a workflow that runs on every push or pull request
tags: [ci, self-grading, judges, evidence, checks, check-value, duplicates]
---

Every CI check must catch a defect that a user or consumer of a shipped artifact would encounter: a package, app, service, or published tool. Each added or moved CI job or step must carry a YAML comment naming that defect; a tool name or "validate" is not a defect. As Addy Osmani writes: "You review that code ... If you can't explain what a module does, it doesn't go in." (https://addyosmani.com/blog/agentic-engineering/).

No check may duplicate another check catching the same defect on the same files: "Reduce the tool set until each tool has one unambiguous purpose" (https://github.com/muratcankoylan/agent-skills-for-context-engineering, skills/tool-design/SKILL.md:31). Workflows running on every push or pull request must report a verdict or ship an artifact; otherwise name what consumes their output or remove the trigger.

CI checks must never grade the repository's own docs, plans, rule packs, file layout, CI timings, or CI cost. Testing a tool the repository ships against a planted violation tests that product and is permitted.

Do not commit LLM judges, calibration sets, or recorded judge outputs to grade the repository's own code, layout, or changes. That judgment belongs in review. Do not commit screenshots, run logs, or judge verdicts as proof that a change works; put proof in the pull request description.

Decision test: Reject the diff if:

1. An added or changed CI job or step lacks a YAML comment naming the defect it catches in shipped artifacts.
2. Another check already catches the same defect on the same files.
3. A push or pull request workflow reports no verdict, produces no artifact, and names no consumer.
4. The check targets the repository's own docs, plans, rule packs, layout, timings, or costs.
5. The diff commits an LLM judge, calibration data, judge verdict, screenshot, or run log.

Defect prevented: Duplicate checks waste runner time without expanding coverage. Checks that grade the repository itself consume runner minutes on issues end users never face, generating noisy failures that train developers to ignore red checks. Committed proof files go stale with the next change while misleading readers as current.

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

Source: Sadowski et al., "Lessons from Building Static Analysis Tools at Google", Communications of the ACM 61(4), 2018: "If a tool wastes developer time with false positives and low-priority issues, developers will lose faith and ignore results" (https://research.google/pubs/lessons-from-building-static-analysis-tools-at-google/).

Gate: judge
