---
title: A document that asserts a count of another document drifts silently
date: 2026-08-13
category: documentation-gaps
module: repo-wide enforcement and harness doctrine
problem_type: documentation_gap
component: documentation
severity: medium
applies_when:
  - writing prose that states how many items another file or directory contains
  - a doc quotes a range, total, or population that grows as work proceeds
  - deciding whether a figure in prose needs a command behind it
tags:
  - stale-documentation
  - derived-figures
  - drift
---

# A document that asserts a count of another document drifts silently

## Context

Prose reaches for a number to orient the reader: how many rules exist, how many entries a ledger holds, how many cases a table covers. The number is accurate when written. Nothing keeps it accurate, and nothing notices when it stops being accurate, because prose is not an input to any procedure.

## Guidance

**A document asserting a count of another document, without a check that recomputes it, drifts the moment the counted set changes.** This is a defect class, not an accident of carelessness — the number cannot be maintained by attention, because the person adding the eighty-fifth entry has no reason to be reading a sentence somewhere else that says there are sixty.

Three responses, in order of preference:

1. **Name the command instead of the number.** Point the reader at what recomputes it. A sentence that says "the count comes from this command" cannot go stale; it stays true as the count moves.
2. **State the figure with its date and its method**, accepting it as a dated measurement rather than a standing fact. This is honest and it degrades gracefully.
3. **Put the number behind a check** that fails when prose and reality diverge — worth it only where the figure is load-bearing, since the check is itself a gate that must earn its place.

What does not work is writing the number carefully. Precision at authoring time is unrelated to accuracy later.

## Why This Matters

The drift is undetectable by construction. The figure is read by no procedure, so no gate is wrong when the figure is wrong; there is no failing check and no error to see. A reader who trusts it is misled in the confident direction — they act on a total that describes the past.

It is also self-concealing at review. The sentence is grammatical, the number is plausible, and verifying it requires leaving the document to go count something. Reviewers do not, so a stale figure survives every pass that looks at the document alone.

## When to Apply

Whenever prose is about to state a quantity drawn from somewhere else:

- **Ask whether the counted set can grow.** A fixed, closed enumeration is safe to state. Anything that accretes is not.
- **Prefer the command to the figure**, and say where the figure comes from.
- **If the number stays, date it** and name the method that produced it.
- **Treat an unattributed count in a review as a question**, not as information — the cheap check is to recompute it once.

## Examples

**A range that outran the ledger.** A derivation document stated that its concession ledger ran from the first to the sixtieth entry. The ledger had reached eighty-four. The prose had carried the stale range well past the point of being wrong, and nothing detected it, because the number was read by no procedure — so no gate was wrong when it was wrong. The repair was to replace the hardcoded range with the command that reports the entry count and status histogram, which cannot go stale.

**A population figure that needed recomputing before use.** A count of enforcement rules quoted in prose was worth confirming before it was reused in an issue: recomputing it over the actual sources gave the population directly, which is the check the previous stale range had never had. A figure that survives recomputation can be cited; one that has not been recomputed is a hypothesis about the past.

## Related

- `docs/solutions/conventions/state-a-claims-epistemic-status.md` — the general discipline: label a claim by the kind of thing that would defeat it
- `docs/solutions/architecture-patterns/provenance-ritual-gates.md` — why putting a number behind a check only helps when the check decides the claim rather than its shape
