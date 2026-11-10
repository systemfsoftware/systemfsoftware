---
title: A failing property is triaged against the contract before anyone edits: an input the contract does not admit fixes the generator, an admitted input that breaks a claimed property fixes the code
applies_when:
  - a property turns red, locally or in CI
  - a pull request narrows a generator, adds a filter, or changes a property's predicate after a failure
  - writing the generator for a property: deciding which inputs to draw
tags: [property-test, triage, counterexample, generator, soundness, regression]
---

Draw only inputs the contract and its callers admit (sound), and as many of those as you can (complete). When the two conflict, keep it sound and accept less coverage. Find the preconditions the callers rely on but never write down, and build them into the generator. Never narrow beyond what the contract requires: no size cap, range or alphabet the code does not impose. Build the constraint into the generator rather than discarding draws after the fact (drawn-values-reach-the-decision.md).

When a property fails, answer in order:

1. **Does it reproduce?** Rerun with the replay token and keep the shrunk counterexample. A failure that does not reproduce is a defect in the test or the environment; find it before anything else.
2. **Does the contract admit the input?** If the operation's docs, schema or callers rule the input out, the generator is unsound. Fix the generator. Never add a special case to the code for an input nobody can send.
3. **Does the contract claim the property?** If not, the property is invented (properties-state-what-the-contract-claims.md). Delete it, or take the clause to the contract's owner.
4. **Otherwise it is a bug.** Fix the code, and keep the shrunk counterexample as an example test through the public entry.

Never pass a failure by weakening the predicate, catching the failure, or pinning a seed or a literal that avoids the input.

A green property is checked too: it must call the operation consumers use, not a wrapper or a stub around it (oracles-are-independent-of-the-code-under-test.md), and it must be shown to fail (properties-are-shown-to-fail.md).

Source: the triage rubric of the property-based-testing agent by Muhammad Maaz ([agentic-pbt](https://github.com/mmaaz-git/agentic-pbt)), published on the Hypothesis project's site ([article](https://hypothesis.works/articles/claude-code-plugin/)).

```
WRONG (fix commit): the stay-length property failed for 0 nights; skip zero in the predicate
  - (subject, [s]) => subject(s).total >= 0
  + (subject, [s]) => s.nights === 0 || subject(s).total >= 0
RIGHT (triage note): counterexample { nights: 0 } replays; the published Stay schema requires nights >= 1,
  so the generator was unsound: draw Stay from its schema instead of an integer pair. Predicate unchanged.
```
