# AGENTS.md — `recommended/`

> Delta only. Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`. Universal rules: root `AGENTS.md`.

This package ships settings, not rules: `src/index.ts` declares which **stock** oxlint rules the architecture recommends, and where. It has no rule logic and no plugin dependencies — the custom cell rules live in their own packages and compose with this preset. See `README.md` for the derivation and the refusal ledger.

```yaml
- id: RC1
  title: Declaration data only — no functions, no control flow, no test infra
  do: express every setting as a literal — rule keys written out, glob arrays written out, groups composed by spreading named constants
  dont: compute a rule key or a glob (a helper, a map, a loop), or add stryker/vitest/test files to this package
  harm: a computed glob or key is behavior a mutation can get wrong, and a wrong glob is worse than a missing rule — the gate reports nothing and reads as passing; the same reasoning exempts this package from MG1, and it only holds while there is nothing here to mutate
  check: `node scripts/guard-no-behavior.mjs` — wired into this package's `lint` script, so it runs on every `pnpm check`; verified firing on an injected arrow function (exit 1) and clean on the real source (exit 0)

- id: RC2
  title: RC1 holds only while this package stays declaration data
  do: re-derive from packages/oxlint-plugins/AGENTS.md#MG1 the moment a setting genuinely requires computation, and add the tests and mutation gate with it
  dont: read RC1 as a permanent "no tests ever" — it is scoped to the current shape, not the package forever
  harm: treating RC1 as permanent would exempt real future behavior from the family's actual gate
  check: review — a PR that adds a function to src/ must either revert to literals or arrive with MG1 coverage; the guard enforces the shape, not this judgment

- id: RC3
  title: Every recommended rule names its invariant and its gate
  do: when adding a rule to configs.recommended, add its row to the README tier table with the constitutional article or theory law it defends, and confirm no family rule already gates it
  dont: enable a rule because it is popular, because a category contains it, or because it fired on something once
  harm: a rule that defends no named invariant fires on correct code, and each such rule teaches the team to disable rules — which costs the gates that do defend invariants (L1)
  check: review — every key in configs.recommended.rules appears in a README tier table; every deliberate omission that a reader would expect appears in the refusal ledger
```
