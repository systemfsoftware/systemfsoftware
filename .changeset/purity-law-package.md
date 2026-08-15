---
'@systemfsoftware/effect-purity-law': minor
---

Add `@systemfsoftware/effect-purity-law`: the determinism law `∀x. f(x) = f(x)` for any function the taxonomy calls pure, registered with `@effect/vitest` in one call.

The package exists because of a measured asymmetry. `kernel-no-ambient-impurity` reports `Math.random()` written directly in a kernel cell and reports nothing when the same call sits one indirection away behind an imported helper — its own config states that a helper imported from another module is "genuinely not followed". Applying the caller twice returned 1.0140990551606173 and then 1.4605868309411392. A lint rule resolves a called name against the file it is reading; a run resolves it against the program.

`ruleOfPurity` compares with `Object.is` rather than `===`, because `Arbitrary.make(Schema.Number)` draws `NaN` — measured 3 times in 5000 samples — and `NaN === NaN` is false, which would report a pure function as impure in roughly one run in sixteen at the default `numRuns`. `ruleOfPurityBy` takes the codomain's equivalence for functions returning a structure.

Repetition cannot observe I/O whose result is constant; PURE-L2 states that limit rather than implying coverage.
