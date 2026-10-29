---
title: Every value a decision reads is drawn by the property, never pinned by a literal, a committed seed or an explicit run count
applies_when:
  - writing or changing an it.prop, it.effect.prop or it.law property, in a *.workflow.property.test.ts or an in-source block
  - a property's spec sets arbitrary.seed or runs, or its body builds a command from literals
tags: [property-test, generator, seed, finite-domain, workflow]
---

A workflow property draws the whole command from the command schema passed to Workflow.make, or each field the decision reads from that field's production schema. A construction parameter with no production counterpart (an offset, a filler character, a pool index) is drawn inline in `of` (Schema.Literals([-2, -1, 0, 1, 2])); a test never declares a module-scope schema (schema-declaration-location refuses it) and never refines a production schema (invariants-live-in-the-schema.md). A drawn value is narrowed in the schema in `of`, never by arithmetic inside holds (`% n`, Math.abs, clamping): a filter or map over a stock draw is a hand-built generator (prop-arbitrary-schema-origin).

Never write a literal for a command field the decision reads, and never draw only fields the decision ignores: a hard-coded value is one a wrong implementation can special-case (Property-based testing part 3, the EDFH and the magic Int32.MinValue). A literal is allowed for a field the property's name states as its precondition (→ReadWrite_…, StrictProjection), or one a sibling property in the same file draws across its domain. The test: replace every drawn value with one constant; if the branch taken and the expected answer stay the same, and the drawn values only pass through (equal on both sides, or echoed into the expected payload), the property is one example.

Never commit arbitrary: { seed } on a property outside packages/runner/vitest/**: a seed pins every run to one input sequence. A fixed seed is for documentation and investigation; a failure is reproduced by its replay token (ARBITRARY.md), and pinning a seed or raising runs hides an unmet precondition instead of meeting it (small-budget-refutation-probe-misses-under-edge-bias.md).

Never set runs in a property spec: any explicit runs overrides every tier the shared config sets, 30 in a Stryker worker, 1000 in CI and 100 otherwise (vitest-config lib/base.js; the runner's mergedOptions).

A decision over a small finite domain (booleans, literals, a few tags) has one property that compares the whole table with a literal model written from the contract, and a cover class for every row, so CoverageBelowMinimum fails a row the run never drew ("If your domain is small enough, why not check all the values in it?", Property-based testing part 4); the runner has no exhaustive enumeration today. Region properties beside it may fix fields their name's domain states, and Schema.Literals may list a claim's whole stated domain.

The binder after ∀ or ∃ names a value drawn in `of` ("A property quantifies over a named input drawn from a generator", pbt-naming); a binder after → names the precondition the body fixes. A word in the domain or operand that claims something about the inputs (First, Any, WhateverTheBudgets, TracksItsLimit) names a range the body varies; an operand that names the output relation (a tag, a law, an oracle) is exempt.

A case with fixed values is an example test through the public entry (the testing pack's behaviour tests), never an it.prop. Schema refusal properties follow refusal-properties-draw-from-the-base-type.md, and a failing generated law follows law-failures-are-codec-defects.md.

Whether a value is drawn, fixed by a stated precondition or pinned is decided by the review judge; an uncertain case escalates.

```typescript
// WRONG: the drawn name never reaches the decision; mode, size, seed and runs are pinned
it.prop(
  '∀u_AdmitUpload_→OversizedPastCap',
  { of: [UploadName], subject: admitUpload, runs: 100, arbitrary: { seed: 500_012 } },
  (subject, [name]) =>
    Result.getOrThrow(subject(new AdmitUpload({ name, mode: 'read-write', body: 'a'.repeat(CAP + 1) })))._tag ===
      'UploadRefused',
)
```

```typescript
// RIGHT: the whole mode × size table against a literal model, every row covered
// bodyOf and answerOf: boundaries-and-collisions-are-constructed.md
it.prop(
  '∀u_AdmitUpload_≡ContractTable',
  {
    of: [UploadName, StoreMode, Schema.Boolean, Schema.Literals(['a', 'é', '€', '😀'])],
    subject: admitUpload,
    cover: {
      writeFits: [(_n, mode, over) => mode === 'read-write' && over === false, 0.15],
      writeOver: [(_n, mode, over) => mode === 'read-write' && over === true, 0.15],
      readFits: [(_n, mode, over) => mode === 'read-only' && over === false, 0.15],
      readOver: [(_n, mode, over) => mode === 'read-only' && over === true, 0.15],
    },
  },
  (subject, [name, mode, over, filler]) => {
    const body = bodyOf(filler, over ? CAP + 1 : CAP)
    const table = {
      'read-write': { fits: `Admitted ${body}`, over: 'Oversized' },
      'read-only': { fits: 'ReadOnly', over: 'ReadOnly' },
    }
    return answerOf(Result.getOrThrow(subject(new AdmitUpload({ name, mode, body })))) ===
      table[mode][over ? 'over' : 'fits']
  },
)
```

Gate: judge
