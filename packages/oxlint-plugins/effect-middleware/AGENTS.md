# AGENTS.md — `effect-middleware/`

> Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`.

Only the mechanically lint-gatable gates are implemented: MW2 (no operation imports) and MW3 (decode-failure branches produce `Effect.fail`, never `Effect.succeed` of an Option or nullable). MW1, MW3b, and MW4 stay review-gated.

```yaml
- id: MM1
  title: Middleware may use the Effect runtime
  do: keep middleware-no-operation-imports scoped to the operation trio's bindings — *Executor/*Workflow/*Store import bindings only; the .middleware.ts → .executor/.workflow/.store module edge lives in cell-import-boundary (@systemfsoftware/oxlint-plugin-cell-imports)
  dont: extend it to effect submodules or the effect barrel
  harm: middleware is impure transport behavior; banning effect/Effect forbids the whole job the cell exists to do
  check: `grep -q "from 'effect/Effect'" src/rules/__tests__/middleware-no-operation-imports.test.ts` — a RuleTester valid case imports effect/Effect and passes

- id: MM2
  title: The gate rule keys on decode-failure branch context
  do: keep middleware-gate-fails-on-decode-failure firing only inside an absence-check if's consequent
  dont: ban Effect.succeed(Option|null) everywhere — the else of an absence check is the success path
  harm: an unconditional ban reports success-path code and drowns real violations
  check: valid cases prove `if (session) { … }` consequents and `else` branches pass

- id: MM3
  title: Match Effect and Option by identifier only
  do: match the canonical identifiers Effect and Option directly, like the family matches S
  dont: accept aliases or destructured Option members
  harm: every rule here hardcodes canonical identifiers; widening one breaks the canonical-identifier contract its siblings enforce
  check: `grep -q "Other.succeed" src/rules/__tests__/middleware-gate-fails-on-decode-failure.test.ts && grep -q "storefront" src/rules/__tests__/middleware-no-operation-imports.test.ts` — each rule has a near-miss valid case proving the canonical identifier is required
```
