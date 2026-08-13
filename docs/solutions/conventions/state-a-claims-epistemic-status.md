---
title: State a claim's epistemic status or the citation rule becomes untestable
date: 2026-08-13
category: conventions
module: repo-wide enforcement and harness doctrine
problem_type: convention
component: documentation
severity: medium
applies_when:
  - writing a document that mixes derived results with measured facts
  - a document requires claims to carry a source and some claims carry none
  - recording a step that depends on judgement rather than a procedure
tags:
  - claim-hygiene
  - provenance
  - derivation
  - honest-status
---

# State a claim's epistemic status or the citation rule becomes untestable

## Context

A document that states rules about the world usually also states rules about itself — most commonly "every claim carries a source." That self-rule is what makes the document auditable, and it is broken not by uncited claims but by claims whose _kind_ is unstated, because a reader cannot tell whether a missing citation is a violation or correct.

## Guidance

Distinguish the kinds of claim explicitly, and label each one where it is made.

- **Internal readoff.** A quantity read off an artifact the document itself contains — a count from its own table, a signature from its own listing. It cites nothing because there is nothing outside it to cite. This is legitimate and must be marked as such.
- **Empirical measurement.** A fact about the world. It always carries a source and a strength, and it is defeated by re-measurement, not by argument.
- **Derivation.** It follows from stated premises. Its status travels with its premises: if a premise falls, the result falls, so the premises must be named.
- **Judgement.** No procedure decides it. Say so plainly rather than dressing it as a procedure — a judgement written as a series of steps invites a reader to expect a determinate answer and to treat disagreement as an error.

**Conflating internal readoff with empirical measurement makes the citation criterion untestable.** Once both appear as bare assertions, "does every claim carry a source?" has no answer: the uncited ones are indistinguishable between correct-by-kind and delinquent.

Two labels earn their own mention because they are the ones most often skipped:

- **"Empirical, not derived."** A result presented among derivations, but actually an observation. It is defeated by different evidence than its neighbours and must not inherit their standing.
- **"Weak support."** A real risk or a real claim resting on thin ground. Recording the weakness keeps it a tracked liability instead of hardening into a finding through repetition.

## Why This Matters

The cost is not a wrong claim; it is the loss of the ability to _find_ wrong claims. A document whose claim kinds are unlabelled cannot be audited for grounding, so its weakest assertions are protected by the same silence as its strongest, and repetition slowly promotes them. A later reader has no way back — the evidence that would have graded a claim is exactly what was omitted.

The reverse discipline pays immediately. A claim marked as judgement invites the right response, which is a decision rather than a search for the missing check. A claim marked as weak invites the measurement that would settle it. A claim marked as internal readoff stops being reported as a grounding violation on every pass.

## When to Apply

When writing or reviewing any document that mixes results:

- **Label each load-bearing claim by kind** — readoff, measurement, derivation, or judgement — at the claim, not in a preface.
- **Name the premises of a derivation**, so its fall is traceable.
- **Mark an observation among derivations as empirical**, so it is not defended or attacked as though it were proved.
- **State weak support as weak.** A tracked weakness is durable; an unmarked one becomes accepted.
- **Never present a judgement as a procedure.** If nothing decides it, that is the finding.

## Examples

**The two senses of "measured".** A specification used the word internally — a quantity is measured when it is read off an artifact printed in the document. A claim measured _empirically_ is a fact about the world and always carries a source and a grade. Both were written as "measured", and the effect was that the document's own citation criterion could not be tested, because a bare claim could be either kind.

**An observation sitting among theorems.** In a table of derived results, one row stated that an index key nothing verifies drifts, and that a drifted key retrieves the wrong doctrine. That row was explicitly marked _empirical, not derived_ — it is observed behaviour, so it stands or falls on evidence rather than on the argument that carries its neighbours.

**A judgement left as a judgement.** Deciding which concrete foreign modules constitute a single vocabulary was recorded as judgement-based, unlike the rest of the machinery, and stated plainly rather than disguised as a procedure. Naming it that way is what stops a later reader from hunting for the mechanical rule that would settle it.

**A risk recorded as weakly supported.** A standing risk — that a fine-grained taxonomy tends to collapse, where an empty category is a hard signal but drift toward one is not — was recorded as resting on weak support, explicitly "a real risk with weak corpus support, not a measured finding."

## Related

- `docs/solutions/architecture-patterns/constraint-reaches-only-via-window-or-gate.md` — the enforcement analogue: whether a rule reaches anything is asserted by demonstration, never inferred
- `docs/solutions/architecture-patterns/provenance-ritual-gates.md` — what happens when a gate checks the shape of a justification and reports the claim
- `docs/solutions/documentation-gaps/a-document-asserting-a-count-of-another-document.md` — the countable case of the same discipline
