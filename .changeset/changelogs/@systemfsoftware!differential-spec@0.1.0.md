## 0.1.0

### Minor Changes

- New package: differential-testing harness. Relational-oracle kernel (`runDual`, `runDifferentialWithShrink`, `runMetamorphicWithShrink`) captures each side as an `Exit`, shrinks divergences to the minimal counterexample, and fails with a `DisparityError` carrying the minimal input, both rendered outcomes, and the fast-check repro seed. Both sides failing identically counts as agreement; an inconclusive or interrupted run fails closed instead of passing silently. Both `run*` kernels and the DSL accept optional `runBudget` / `interruptAfterTimeLimit` options. Fluent surface: `Differential.compare({ reference, candidate }).on(arb).assert(oracle)` and `Metamorphic.on(system).relation({ transformInput, assertOutput }).on(arb)`.
