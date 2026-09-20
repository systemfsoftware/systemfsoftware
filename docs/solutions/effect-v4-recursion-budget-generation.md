# Solution: Effect v4 gives recursion budgets one honest job — validate and mark, never bound

## Problem

The `recursionBudget` annotation pipeline was ported from the v3 fast-check world, where a hook could own a depth-bounded generator (`fc` recursion with `maxDepth` and a per-schema `depthIdentifier`). The v4 port initially kept that shape as an identity `Schema.link` over the suspended schema — a tautology that looked like generation control but bounded nothing, while `depthSize` was decoded and silently discarded.

The observable failure is semantic, not runtime: tests passed, but the annotation's contract (a ceiling the generated values stay inside) was enforced by nothing. A reviewer reading the hook could not tell what it actually did.

## Failure mechanisms

1. **The v4 compiler never reads `toCodecArbitrary` off a `Suspend`.** The declaration compiler consults the hook only on `Declaration` nodes (`compileDeclaration` in effect's internal arbitrary compiler); a `Suspend` compiles by thunking to its body (`recur(ast.thunk())`). Any Link returned from a suspend annotation is dead weight for generation. The hook's real consumers are the validation it performs and the `hasDerivationHook` probe the laws run.
2. **Depth is not a v4 generation knob.** Native recursion cost is bounded by `state.budget.remaining = generator.minCost + size`, decremented once per recursive suspend entry. There is no per-schema `maxDepth`. The only way to bound generation is the `size` option at the call site (`CheckOptions.size` / `SampleOptions.size`), so the laws pass `size: maxDepth` and assert nesting against the declared ceiling — the annotation cannot.
3. **Eager plan validation deadlocks on self-reference.** `planOf` resolves suspend thunks to find the recursive union and its terminals. Run at `annotate()` time it dereferences the very `const` being declared — `Cannot access 'Chain' before initialization`. Cycle-shape validation must stay behind the returned closure (first derivation); only budget-shape validation (`decodeBudget`, which touches no schema) is safe at module load.

## Architectural invariants

- **One job per layer.** `decodeBudget` validates budget shape at annotate time (malformed budget refuses the module at load); `planOf` validates cycle shape at first derivation (unreachable union refuses derivation by name); the laws translate `maxDepth` into `CheckOptions.size` and assert the nesting ceiling. No layer duplicates another's check.
- **The hook links to the plan, not to itself.** `budgetToArbitrary` returns a Link whose target is `Schema.make(plan.union)` — the materialized plan — so the returned value names what the budget governs, and the identity transforms are the only pass-through.
- **Dead v3 knobs are deleted, not stubbed.** The `depthIdentifier` parameter existed to isolate fast-check depth tokens per schema binding; v4's budget is per-check state, so the parameter, its injection, and its README claims are gone. A stub that accepts and ignores an argument is the same laundering the identity Link was.

## Verification

- `pnpm --filter @systemfsoftware/effect-schema-recursion-budget test` — transform injects the two-argument call; runtime refuses an all-cyclic union and a non-union suspension by name.
- `pnpm --filter @systemfsoftware/effect-schema-law test` — stock deep-share is `=== 0`, annotated deep-share is `≠ 0`, nesting stays `≤ maxDepth + 1` under `size: maxDepth`.
- `pnpm --filter @systemfsoftware/effect-schema-vite test` — the registered plugin materializes the budget through the same transform a consumer runs.
