# AGENTS.md — `@systemfsoftware/effect-purity-law`

> **Delta**: Property-test the determinism law of any function claimed to be pure. A sibling of `@systemfsoftware/effect-schema-law`, which owns codec laws and nothing else. Root AGENTS.md governs.

## Why this package exists rather than another lint rule

A lint rule resolves a called name against the file it is reading. A run resolves it
against the program. That difference is the whole reason this package exists, and it is
measured rather than argued:

| mechanism                    | lines | same defect, one indirection away |
| ---------------------------- | ----- | --------------------------------- |
| `kernel-no-ambient-impurity` | 176   | **missed**                        |
| `∀x. f(x) = f(x)`            | 3     | **caught**                        |

`Math.random()` written directly in a `*.kernel.ts` is reported. The same call behind an
imported helper is not: the walker builds its helper map from the file's own top-level
declarations, and its own config states that "a helper imported from another module" is
"genuinely not followed". Applying the caller twice returned `1.0140990551606173` and
then `1.4605868309411392`.

## What the law enforces

```yaml
rules:
  - id: PURE-L1
    title: Determinism — two applications to the same input agree
    do: call `ruleOfPurity` for a function the taxonomy calls pure, passing the domain's
      arbitrary; use `ruleOfPurityBy` with an equivalence when the codomain is structural
    dont: pass a reference comparison for a function returning a record, an `Either` or a
      `Chunk` — two pure applications build two objects and the default `===` reports a
      violation that is not one
    harm: ambient nondeterminism reaches a pure phase behind an import and nothing
      notices; the interpreter's order and response laws still pass, because they never
      ask whether a phase declared pure is pure
    check: "`pnpm --filter @systemfsoftware/effect-purity-law test` exits 0"

  - id: PURE-L2
    title: Constant-returning I/O is out of reach — say so rather than imply coverage
    do: state in the call site's own comment when a function performs I/O whose result is
      constant, because repetition cannot detect it
    dont: claim a function is pure on the strength of this law alone when it writes a file,
      emits a metric, or mutates something outside itself and returns the same value
    harm: the law passes, the reader infers purity, and an effect that repetition cannot
      observe ships as a pure phase. That class needs interaction observation, which this
      package does not do and does not pretend to
    check: review — the reviewer names, for each function under this law that touches
      anything outside itself, why repetition suffices
```

## Verification

```bash
pnpm --filter @systemfsoftware/effect-purity-law typecheck
pnpm --filter @systemfsoftware/effect-purity-law test
pnpm --filter @systemfsoftware/effect-purity-law lint
pnpm --filter @systemfsoftware/effect-purity-law api:check
pnpm --filter @systemfsoftware/effect-purity-law attw
```
