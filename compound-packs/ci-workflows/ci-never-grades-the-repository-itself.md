---
title: Nothing the repository runs grades its own docs, plans or work, and no proof of a change is committed
applies_when:
  - adding a CI job, task, script or test, or changing what one checks
  - adding an LLM judge, calibration data or a recorded judge output
  - attaching proof that a change works
tags: [ci, self-grading, judges, evidence]
---

Title: Nothing the repository runs grades its own docs, plans, packs or layout.

No CI job, task, script, hook or test has the repository's own docs, plans or packs as its subject.

No LLM judge, calibration set or recorded judge output is added to grade the repository's own code, layout or changes; those questions go to the review judge.

Whether a check's subject is the repository itself is decided by the review judge; an uncertain case escalates.

Gate: judge
