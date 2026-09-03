# AGENTS.md — `@systemfsoftware/oxlint-plugin-recommended`

Shared conventions: `packages/lint/oxlint/plugins/AGENTS.md`. Ships settings, not rules: which stock oxlint rules the architecture recommends, and where. Derivation and refusal ledger: `README.md`.

## Rules

| ID      | Rule                                                                                                                                                                                                                                | Gate                                                                                                                                  |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **RC1** | Declaration data only: every setting is a literal — rule keys and glob arrays written out, groups composed by spreading named constants. No functions, no control flow, no test infra.                                              | `node scripts/guard-no-behavior.mjs` — wired into this package's `lint` script, so it runs on every `pnpm check`                      |
| **RC2** | RC1 holds only while this package stays declaration data; a setting that genuinely requires computation re-derives from OX-MG1 and arrives with tests and a mutation gate.                                                          | `review`                                                                                                                              |
| **RC3** | Every recommended rule names its invariant: adding a rule to `configs.recommended` requires its README tier-table row naming the constitutional article or theory law it defends, and confirmation no family rule already gates it. | `review` — every key in `configs.recommended.rules` appears in a README tier table; deliberate omissions appear in the refusal ledger |

## Verification

```bash
pnpm --filter @systemfsoftware/oxlint-plugin-recommended typecheck
pnpm --filter @systemfsoftware/oxlint-plugin-recommended lint
```
