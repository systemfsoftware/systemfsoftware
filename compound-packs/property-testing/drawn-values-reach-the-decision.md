---
title: Every value a decision reads is drawn by the property, never pinned by a literal, a committed seed or an explicit run count
applies_when:
  - writing or changing an it.prop, it.effect.prop or it.law property, in a *.workflow.property.test.ts or an in-source block
  - a property's spec sets arbitrary.seed or runs, or its body builds a command from literals
tags: [property-test, generator, seed, finite-domain, workflow]
---

Draw the whole command from the command schema passed to `Workflow.make`, or each field the decision reads from that field's production schema. Draw a construction parameter with no production counterpart (an offset, a filler character, a pool index) inline in `of` (`Schema.Literals([-2, -1, 0, 1, 2])`). Narrow a drawn value in the schema in `of`, never by arithmetic inside the predicate (`% n`, `Math.abs`, clamping), and never refine a production schema in a test (schema-modelling pack: invariants-live-in-the-schema.md).

Never write a literal for a command field the decision reads: a pinned value is one a wrong implementation can special-case. A literal is fine for a field the property's name states as its precondition, or one a sibling property in the file draws across its domain. Test: replace every drawn value with one constant; if the branch taken and the expected answer stay the same, the property is one example.

Never commit `arbitrary: { seed }` in a property: a seed pins every run to one input sequence. Reproduce a failure with its replay token. Never set `runs` in a property spec: it overrides every tier the shared config sets.

For a decision over a small finite domain (booleans, literals, a few tags), write one property that compares the whole table with a literal model written from the contract, with a cover class for every row.

A case with fixed values is an example test through the public entry (testing pack), never an `it.prop`. Schema refusal properties follow the schema-modelling pack's refusal-properties-draw-from-the-base-type.md, and failing generated laws law-failures-are-codec-defects.md.

```typescript
// WRONG: the drawn name never reaches the decision; mode, size, seed and runs are pinned
it.prop('∀u_AdmitUpload_→OversizedPastCap', { of: [UploadName], subject: admitUpload, runs: 100, arbitrary: { seed: 500_012 } },
  (subject, [name]) => Result.getOrThrow(subject(new AdmitUpload({ name, mode: 'read-write', body: 'a'.repeat(CAP + 1) })))._tag === 'UploadRefused')
```
