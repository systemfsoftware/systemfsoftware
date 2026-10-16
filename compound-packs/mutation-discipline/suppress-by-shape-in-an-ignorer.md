---
title: Mutants no test should observe are excluded by a shared ignorer keyed on declaration shape, never by a disable comment or an excluded mutator
applies_when:
  - a mutant sits on declaration data (identifiers, descriptions, brand names, annotations) that no behaviour reads
  - a mutant breaks a build-time transform instead of changing runtime behaviour
  - someone proposes a `// Stryker disable` comment or excluding a mutator to clear a survivor
  - changing a Stryker ignorer
tags: [mutation-testing, ignorers, stryker, declarations, suppression]
---

Some mutants change text that no test should observe: a schema identifier, a description, a value a build-time transform reads before any test runs. Killing them would need a test that pins documentation, which is a change-detector test. Leaving them alive leaves the score below the gate.

Stryker offers three ways to take a mutant out of the score: exclude the mutator, write a `// Stryker disable` comment, or register an ignore plugin. "Disabled mutants will remain in your report but will get the `ignored` status" in every case (`disable-mutants.md`, https://stryker-mutator.io/docs/stryker-js/disable-mutants/). The three differ in how the decision is made, not in what the report shows.

Excluding a mutator drops a whole class of mutation everywhere, which Stryker itself calls "a shotgun approach". A disable comment is written beside a survivor someone has already seen, one site at a time, with nothing making the next site of the same shape get the same answer; the constitution's mutation check fails suppression comments (`repos/constitution/ENFORCEMENT.md:226`, CONST-T3). A shape-keyed ignorer decides once, from the syntax of the declaration, for every package that uses it, and reports its reason on every mutant it ignores. Google's mutation service draws the same line at scale: its arid-node heuristics, built from developers' "Not useful" feedback, mark code whose mutants "are never created in the first place" (Petrović and Ivanković, "State of Mutation Testing at Google", ICSE-SEIP 2018, §4; Petrović et al., arXiv:2102.11378, §2.2 and §3.1). That is the analogy for the decision only: in Stryker the mutants are created and reported `ignored`.

## Rule

Exclude a mutant that no test should observe through a shared ignorer that recognises the declaration shape, reports a reason, and has tests that refuse near-miss shapes. Never through a `// Stryker disable` comment on a survivor, and never by excluding a mutator.

- The ignorer's key is the syntax of the declaration (which call, which argument, which key), never a file path or a name.
- Every match carries a stable reason, so the report says why each mutant left the score.
- Every shape the ignorer accepts has tests showing that a near miss stays live: the same key in another position, a computed key, a behaviour hook beside the declaration data.

```ts
// WRONG: systemfsoftware/systemfsoftware 732f66a0c8:packages/discern/src/PatternAst.schema.ts:43-48
// The shared ignorer at the time, before systemfsoftware/stryker-js-effect 8df6ee9ca7 (PR #259), did not
// recognise this annotate object, so Stryker instrumented it, and the dry run failed with Budget_RequiresTransform.
// Record: that fix commit's changeset, .changeset/schema-ignorer-recursion-budget.md.
export const PatternAst: Schema.Codec<PatternAst> = Schema.suspend((): Schema.Codec<PatternAst> =>
  Schema.Union([SemanticAst, DeterministicAst, AndAst, OrAst, NotAst])
).annotate({
  identifier: 'PatternAst',
  recursionBudget: { maxDepth: 6, depthSize: 'small' },
})

// RIGHT: systemfsoftware/stryker-js-effect 8df6ee9ca7
// packages/ignorers/effect-schema-declarations/tests/effect-schema-declarations.test.ts:262-270, 436-459
// The holder object and the budget value are ignored with their own reasons ...
ignores: [
  { text: patternAstAnnotation, reason: RECURSION_BUDGET_HOLDER_IGNORED },
  { text: patternAstBudget, reason: RECURSION_BUDGET_IGNORED },
],
// ... and the near misses stay live:
{ name: 'the union a recursive declaration suspends stays live beside its ignored budget', keeps: ['[SemanticAst, DeterministicAst, AndAst, OrAst, NotAst]'] },
{ name: 'a `recursionBudget` key outside an annotate call stays live, object and value' },
{ name: 'an annotate object holding a budget beside a behaviour hook stays live as an object' },
{ name: 'a computed `recursionBudget` key stays live, object and value' },
```

The shared ignorers are published from `systemfsoftware/stryker-js-effect`; a missing shape is fixed there, in the ignorer and its near-miss tests, not in the package that met the survivor. Which mutants a package enrols is decided by what the code is, not by its path (CONST-T12; `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md`).

Gate: `review`. The change adds no `// Stryker disable` comment and no excluded mutator, and an ignorer change carries a near-miss refusal test for each new shape.
