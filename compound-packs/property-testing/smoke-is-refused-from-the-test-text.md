---
title: A reviewer sorts each property as smoke or unproven from its text, and only reproduced evidence counts a property
applies_when:
  - reviewing a pull request that adds or changes an it.prop, it.effect.prop or it.law property
  - a review or merge verdict rests on a decision being covered by properties
  - auditing an existing property file
tags: [property-test, review, smoke, checklist]
---

This file is an index: each signature names the rule file whose sentence the property breaks, and the reviewer cites that sentence. Schema refusal properties follow refusal-properties-draw-from-the-base-type.md and generated laws follow law-failures-are-codec-defects.md; neither is judged here. it.prop text inside a string literal (a lint rule's RuleTester fixture) is not a property.

SMOKE: the text shows the property cannot fail on a named wrong implementation, or explores one fixed input sequence. A smoke property is deleted or rewritten.

- S1 committed seed (drawn-values). Mechanical: `git grep -nE "arbitrary: \{[^}]*seed:" -- '*.test.ts' ':!packages/runner/vitest/**'`
- S2 one example: a literal for a read field outside a stated precondition, or the constant-replacement test leaves the answer unchanged (drawn-values)
- S3 the name claims a range the body fixes (drawn-values, binder)
- S4 a finite decision with no whole-table property, or Literals narrower than the claim's stated domain (drawn-values). Flag: `git grep -nE "Schema\.Literals\(\[[^],]+\]\)" -- '*.property.test.ts'`
- S5 narrowing arithmetic inside holds (drawn-values)
- S6 a named boundary whose equal point and neighbours no property builds (boundaries)
- S7 a structure the branch needs (collision, literal, pattern, set, order) that no generator builds (boundaries)
- S8 a size unit the draws never vary (boundaries)
- S9 a replica oracle (oracles)
- S10 a shape-only oracle (oracles). Flag: `git grep -n "Result.isSuccess" -- '*.workflow.property.test.ts'`, then the workflow's `error: Schema.Never`
- S11 a conjunct over values the test computed itself (oracles)
- S12 a payload checked by a bound, prefix, length, one field or "not tag X" with no exact equality property (workflow)
- S13 a planted case always in one position, or a string predicate never given near misses (workflow)
- S14 a fixed context under which the claimed tag and its neighbour give the same asserted output (workflow)
- S15 a decision computed in holds instead of by `subject` (workflow)

UNPROVEN: required evidence is missing. An unproven property does not count yet and is not called smoke.

- U1 runs present (drawn-values). Mechanical: `git grep -nE "\bruns: [0-9]" -- '*.test.ts' 'packages/**/src/**/*.ts'`
- U2 a region with no class or named construction, a constant class, or a minimum under the floor (coverage). Flag: `git grep -L "cover:" -- '*.workflow.property.test.ts'`
- U3 a guard branch that returns true with no class (coverage)
- U4 no reproduced red run per named wrong implementation (properties-are-shown-to-fail.md)

FILE: refuses the decision's proof as a whole, and the review carries a table of each tag against the properties that state it.

- F1 a tag with no property for when it must and must not be chosen, or one side of a boundary (workflow)
- F2 a tag whose only properties are counter-checks (workflow)
- F3 a trivial implementation passes every property in the file (properties-are-shown-to-fail.md)

The review judge only flags; an uncertain case escalates. No signature check, model verdict, green run or pass count counts a property. A property counts when a reviewer has observed the file's merge_group run with no CoverageBelowMinimum, VacuousProperty or SelfModelLaw, and has reproduced each named wrong implementation's red from its diff and replay token; no gate counts a property on its own today, and the merge verdict rests on those observations.

```
WRONG (review verdict)
Properties look comprehensive: 3 it.prop calls, all green in CI. Approved.
```

```
RIGHT (review verdict)
∀e_AdmitEntryWrite_→OversizedPastCap: SMOKE.
  S1: seed 500_012.
  S8: the cap counts UTF-8 bytes; Schema.String draws printable ASCII with multi-byte text only from its edge list, and the
      pinned seed fixes whether any appears, so a decide counting UTF-16 code units passes.
  S9: paddedTo sizes the boundary with entryWireBytesOf and wireOf computes the expected text with entryWireTextOf, the
      encoder decide reaches through entryWireUtf8Of, so a wrong size measure moves the test and the code together.
  S2, S4: mode is a literal in every property of the file, the name states no mode precondition, and no property compares
      the whole mode × size table; the read-only rows live only in ∀e_AdmitEntryWrite_→ReadOnlyRefusedBeforeSize.
  Not flagged: the drawn entry varies only the payload while the body builds the size at CAP and CAP+1 (boundaries).
  UNPROVEN: U2 (no cover), U4 (no reproduced red run).
```

Gate: judge
