---
title: Plans freeze observations about a moving base
date: 2026-08-30
category: workflow-issues
module: constitution amendment workflow
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - A plan names a base revision and its verification rows carry expectations measured at research time
  - Commits land on the branch between plan freeze and the first implementation unit
  - A fixture expectation in a plan contradicts what the gate prints at execution time
root_cause: stale planning baseline
tags: [plan-freeze, base-drift, fixtures, measured-expectations, review-findings]
---

# Plans freeze observations about a moving base

## Context

During the Article III verification amendment, the plan was researched and frozen against base `dd5722a`. Six commits landed on the branch before the implementation units started. By execution time, plan rows that named the pre-split tree ("exactly six vacated ids at this revision", "the uncompared-file clause fires at revision X") described a tree that no longer existed: the corpus split and corpus-commit had moved the vacated-id set to nine and moved the uncompared-file boundary to an earlier revision. The multi-agent review wave flagged the unsatisfiable rows; execution had already recorded the honest outputs by running the gate and keeping what it printed.

The defect is not that the plan was wrong when written — it was measured against the base it named. The defect is that nothing re-derived the expectations when the base moved, and the plan's freeze rule (byte-identical after start) made correcting the rows in place the wrong move.

## Guidance

- At the first implementation unit, re-run every plan verification command against the current head. Record divergent outputs in the run record as measured facts; do not edit frozen plan rows to match.
- Derive fixture expectations at execution time from the gate's actual output. A number carried from research time is a hypothesis about the terminal; the run's own execution is the terminal.
- When a plan row and a measured output disagree, trust the measurement, note the divergence in the run record, and let the review (not the plan edit) carry the correction. Two unsatisfiable rows in this session were caught exactly this way — by a reviewer executing the named revision and comparing against the plan's text.
- Reviewers verify plan claims by execution against named revisions, not by re-reading the plan. That stance is what surfaced the drift; keep it in every review brief.

## Applicability

This applies to any planned change whose plan encodes observations about tree state (counts, absence boundaries, report shapes) rather than only intent. A plan that names only invariants and lets execution derive numbers has no rows to go stale. Where the plan must carry concrete expectations (fixtures for a gate), scope each expectation to the revision it was measured at, so a moved base invalidates the row loudly instead of silently.
