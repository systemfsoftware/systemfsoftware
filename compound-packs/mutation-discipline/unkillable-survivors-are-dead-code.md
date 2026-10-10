---
title: A survivor no reachable input can kill marks dead code; delete it or make it unconstructable instead of baselining it
applies_when:
  - a surviving mutant's written reason says the mutated code cannot be reached or cannot change any result
  - adding a row to a mutation baseline
  - deciding whether to empty, delete, or keep declaration data that a mutant touches
tags: [mutation-testing, survivors, equivalent-mutants, dead-code, baselines]
---

Some survivors cannot be killed by any test, because no input that reaches the code can tell the mutant from the original. Stryker calls these equivalent mutants, and its guidance is to "rewrite the code so it won't occur, or accept that you won't make 100%" (`equivalent-mutants.md`, https://stryker-mutator.io/docs/mutation-testing-elements/equivalent-mutants/).

When the reason a mutant cannot be killed is that the code it mutates does nothing, the survivor is a report of dead code. A baseline row that records the reason keeps the dead code, and the next reader has to rediscover that it does nothing. The constitution's mutation check kills a survivor "with a sharper property or by deleting the dead branch it exploits" (`repos/constitution/ENFORCEMENT.md:226`, CONST-T3), and every line is a liability to delete before adding (CONST-S4).

## Rule

A survivor that no reachable input can kill is deleted when nothing reads the code at runtime, or the state it guards is made unconstructable (CONST-D1). When something reads the mutated value, the survivor is a missing test, and `kill-survivors-with-contract-properties` governs it: write the test that observes the read. When the mutant sits on declaration text no test should observe, `suppress-by-shape-in-an-ignorer` governs it. Never empty a map, or delete a field, that a reader consumes.

A baseline row is the last resort: only for an equivalent mutant on live code that no rewrite can remove, whose written reason shows that no reachable input can tell it from the original and that no declaration shape exists to key an ignorer on.

```ts
// WRONG: systemfsoftware/systemfsoftware commit 87bcba5f57 of PR #706
// packages/oxlint-plugin/oxlint-plugin-dmmf-workflow/src/rules/ReferenceClassification.ts:518
// Baseline row ae5a794f8073e4ae (StringLiteral -> ""), reason: "a scope of type `global` cannot occur,
// so this 'global'/'module' operand is dead". Under this rule that reason obliges deleting the operand;
// if the reason is wrong, it obliges a killing test (kill-survivors-with-contract-properties). The row is wrong either way.
return variable.scope.type === 'module' || variable.scope.type === 'global'

// RIGHT: the same PR, its Appendix D2 (docs/plans/2026-10-09-mutation-main-green.md).
// Two brand maps whose workflows are called directly, never decided through a Sandwich, so nothing reads them at runtime.
// packages/effect-microsandbox/src/classify-probe-observation.workflow.ts:76 (mutant 665dca69fe86b2dd)
// before, origin/main 732f66a0c8:
static readonly [Workflow.InstrumentationBrand] = { platform: 'microsandbox.virtualization.platform' } as const
// after, commit 87bcba5f57 of PR #706:
static readonly [Workflow.InstrumentationBrand] = {} as const

// packages/daemon/effect-daemon-microvm/src/MicroVMMedium/classify-workload-exit.workflow.ts:9 (mutant 9abde07b09ad171e)
// before, origin/main 732f66a0c8:
static readonly [Workflow.InstrumentationBrand] = { code: 'microvm.workload.exit.code' } as const
// after, commit 87bcba5f57 of PR #706:
static readonly [Workflow.InstrumentationBrand] = {} as const
```

The same appendix keeps the other two brand maps. `efa442ce130562fd` (`packages/effect-microsandbox/src/classify-job-exit.workflow.ts:11`) and `14ade17d5d1537f0` (`packages/effect-microsandbox/src/assess-virtualization.workflow.ts:34`) belong to workflows decided through a Sandwich (`.decide(classifyJobExit)`, `.decide(assessVirtualization)`), which emits the brand's names on its span. Trace tests that assert those span attributes kill them. Emptying either map would have deleted live behaviour.

Gate: `review`. A deletion removes only code nothing reads at runtime, declaration text goes to a shape-keyed ignorer, and a new baseline row's reason shows an equivalent mutant on live code with no declaration shape to key on. The survivor's disappearance is read off the next CI Mutation report, never from a local run (REPO-D3, `AGENTS.md:73`).
