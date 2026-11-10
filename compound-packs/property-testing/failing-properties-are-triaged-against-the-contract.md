---
title: A failing property is triaged against the contract before anyone edits; the fix lands in the production schema or the code, never in a narrowed generator or a weakened predicate
applies_when:
  - a property turns red, locally or in CI
  - a pull request narrows a generator, adds a filter or skip, splices in edge values, or changes a property's predicate after a failure
  - writing the generator for a property: deciding which inputs to draw
tags: [property-test, triage, counterexample, generator, soundness, regression]
---

Draw only inputs the contract and its callers admit (sound), and as many of those as you can (complete). Draw them from the production schema, so the generator's domain is the schema's domain (drawn-values-reach-the-decision.md). Derive a domain from its definition, never from a sample of it: the complement of a closed alphabet is drawn from a pattern, not a list of the characters you thought of. A fixed list is the domain only when the set is finite (a union's tags, an enum).

When a property fails, answer in order:

1. **Does it reproduce?** Rerun with the replay token and keep the shrunk counterexample. A failure that does not reproduce is a defect in the test or the environment; find it before anything else.
2. **Does the contract admit the input?** If the published schema admits an input that the operation's docs or callers rule out, the schema is too loose. Tighten the production schema, and the property, drawing from it, stops producing the input. Never filter, skip, narrow or splice values in the test, and never add a special case to the code for an input nobody can send. If the generator was hand-built rather than drawn from the schema, draw from the schema.
3. **Does the contract claim the property?** If not, the property is invented (properties-state-what-the-contract-claims.md). Delete it, or take the clause to the contract's owner.
4. **Otherwise it is a bug.** Fix the code, and keep the shrunk counterexample as an example test through the public entry.

Never pass a failure by weakening the predicate, catching the failure, or pinning a seed or a literal that avoids the input. A property that only passes after such surgery is deleted, unless the surgery exposed a domain production mishandles; then fix the schema and let the property draw it unchanged.

A green property is checked too: it must call the operation consumers use, not a wrapper or a stub around it (oracles-are-independent-of-the-code-under-test.md), and it must be shown to fail (properties-are-shown-to-fail.md).

Source: the triage rubric of the property-based-testing agent by Muhammad Maaz ([agentic-pbt](https://github.com/mmaaz-git/agentic-pbt)), published on the Hypothesis project's site ([article](https://hypothesis.works/articles/claude-code-plugin/)), and the `architect-property-tests` skill (rules PT6, PT9 and PT11).

```
WRONG (fix commit): the stay-length property failed for 0 nights; skip zero in the predicate
  - (subject, [s]) => subject(s).total >= 0
  + (subject, [s]) => s.nights === 0 || subject(s).total >= 0
RIGHT (triage note): counterexample { nights: 0 } replays. The booking docs require at least one night, but the
  published Stay schema accepted 0, so the schema was too loose: Stay.nights is now Int >= 1 in production, and the
  property draws Stay unchanged. Predicate unchanged.
```
