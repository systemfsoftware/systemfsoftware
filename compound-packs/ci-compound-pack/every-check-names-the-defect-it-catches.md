---
title: Every CI check names the product defect it catches, fails the job when it finds one, and catches something no other check catches
applies_when:
  - adding a CI check, job, step, lint rule or workflow that runs on every push or pull request
  - auditing, consolidating or removing existing checks
  - setting a check or lint rule to warn instead of fail
  - a check fails, then passes on a rerun of the same commit
tags: [ci, check-value, flaky, warnings, duplicates, cargo-cult]
---

- A job or step that the change adds or moves carries a YAML comment naming the kind of defect in the product that it catches. A tool name or "validate" is not a defect. By analogy, Osmani on code modules: "You review that code ... If you can't explain what a module does, it doesn't go in." (https://addyosmani.com/blog/agentic-engineering/). Assuming a check is good because it exists is the failure this rule prevents.
- A finding fails the job. A rule or tool set to warn by its own severity settings, a report-only mode, or output only as an annotation or comment is not a check: make it fail or remove it, because warnings are ignored. Fowler: "Once you start ignoring a regression test failure, then that test is useless" (https://martinfowler.com/articles/nonDeterminism.html). A verdict command that hides its failure (`|| true`, `continue-on-error`) is covered by ci-workflows, failures-are-visible-and-reproducible.md.
- No other check catches the same defect on the same files. "Reduce the tool set until each tool has one unambiguous purpose" (https://github.com/muratcankoylan/agent-skills-for-context-engineering, skills/tool-design/SKILL.md:31, an analogy about agent tools).
- A failure that passes on rerun is read before it is called flaky. A failure in a setup step, a spot reclaim or an out-of-memory kill is a runner fault and does not count against the check. A seeded or property test that fails on one seed is a finding until its shrunk input or replay seed shows otherwise: a test that repeatedly fails under property testing is usually finding something (Fowler, nonDeterminism.html footnote 3: "Tests seeded from a randomizer can help hunt out edge cases ... quite different from automated regression tests"). A regression test that is truly flaky leaves the required set until fixed: Google, "only fast, reliable ones" on presubmit (https://abseil.io/resources/swe-book/html/ch23.html); Fowler, "Place any non-deterministic test in a quarantined area. (But fix quarantined tests quickly.)". Osmani: flaky tests "become systemic blockers when forty agents hit the same flaky test simultaneously" (https://addyosmani.com/blog/code-agent-orchestra/).
- A workflow that runs on every push or pull request but reports no verdict and ships no artifact is not a check. Name what consumes its output, or remove the trigger. Do not add checks that make no sense.

To audit a check that already exists, use jev/ci-check-verdict.md.

Consequence: a check that cannot fail, or that duplicates another, costs a runner on every run and catches nothing. That is a maintainability trap (P2). A flaky required check blocks merges in normal use (P1).

Gate: judge
