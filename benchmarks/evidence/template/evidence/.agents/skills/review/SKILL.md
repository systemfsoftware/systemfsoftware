---
name: review
description: Defines what a Review decides about each acknowledgement, how that judgement is recorded as its review, and the configuration and gates each scope owns. Read only for a review objective; backend.md and frontend.md carry the per-scope carriers, configuration, and gates.
---

# Review

The compiler proves that every target resolves, that every unit is acknowledged, and that every acknowledgement carries a review. It cannot prove that a cited requirement was obeyed, because that is a question about behavior.

That question is this objective's whole work. Decide it for every acknowledgement, correct whatever was wrong, and write what you checked as that acknowledgement's review.

Two scopes and no third. Read the per-scope document for the current objective first:

- Backend Review: [backend.md](backend.md)
- Frontend Review: [frontend.md](frontend.md)

Frontend Review is the last one, so the checks that need both layers finished belong there.

## The Worklist

Raise `evidence/review` where the scope document says. Every acknowledgement then reports itself as unreviewed, and that report is the worklist: one still reporting is one you have not reached, and a clean build is the only proof the population was covered.

## Deciding A Citation

Read the target, then read the whole host against it. A citation is true only when the artifact implements, represents, or proves what the target requires; relevance is not enough.

When the two disagree, exactly one of three is wrong, and the requirement is never one of them:

- **The code.** This host is answerable and does not do what the target says. Correct the code.
- **The reason.** The relation is real and the sentence misstates it. Correct the reason.
- **The target.** This host was never answerable and the anchor was reached for to satisfy coverage. Correct the tag, then find out whether the artifact that target needs was ever built.

Ask what the requirement obliges and whether this host is the thing obliged to deliver it. Correcting the code on a target that was never its own repairs a citation error by writing to the wrong file.

Read a target's citations together when more than one artifact answers for it, such as a type and the provider behind it, or an operation and the test that proves it. A published contract that promises what its implementation refuses is a finding on both.

## Deciding An Exclusion

An exclusion says this claim does not cover the target. Nothing in the declaration it sits on can establish that, so decide it by finding what does own the unit.

Two answers end the decision. Either another artifact owns it, and the review names that artifact. Or this layer owes it, the exclusion is standing in for work nobody did, and the repair is to delete the exclusion and build the thing.

A reason that concludes — "not applicable", "internal", "future work", "not implemented" — names no owner and decides nothing.

## Recording The Judgement

Write the review as you finish each acknowledgement, naming what you read or ran. It is what a later reader has instead of your presence, and a review that restates the reason or concludes without naming a check states nothing.

One host with several acknowledgements is one decision about that host. Reviews that cannot be written separately mean the citations are not one responsibility; split the host along the line they expose rather than stretching one check to cover both.

## Configuration

Raising `evidence/review` from `"off"` to `"error"` is this objective's one permitted edit. Compare every configuration the scope document names with the baseline afterwards: a reintroduced `disabled`, a changed claim or selector, a lowered severity, or any other difference is a finding to report and restore, whatever it unblocks.
