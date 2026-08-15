# AGENTS.md — `effect-observer/`

> Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`.

```yaml
- id: OB-P3
  title: Export names use a whitelist, not a blacklist
  do: keep the prefix stems in observer-operational-exports.config.ts — case-insensitive prefix matching, UPPER_SNAKE exempt
  dont: switch to a domain-noun blacklist or exact-match
  harm: a blacklist cannot enumerate domain vocabulary; only the whitelist reports names like anOrder
  check: "`grep -rn \"const OPERATIONAL_PREFIXES\" src/` returns only the config file"
- id: OB-P4
  title: Escaping state is module-level mutable bindings
  do: keep the Program-scope gate on let/var and on const containers (Map/Set/WeakMap/WeakSet, array, object literal)
  dont: extend it to function-scoped state, primitives, or Object.freeze(...) values
  harm: the gate targets state that outlives one operation; per-call state is the sanctioned pattern
  check: "`pnpm --filter @systemfsoftware/oxlint-plugin-effect-observer test` exits 0 — the rule reports only Program-direct declarations, so every invalid case must be one"
- id: OB-P5
  title: OB1 and OB6 are deliberately ungated
  do: leave OB1 (serves the observer frame, review-gated) and OB6 (banned file names) to the reviewer and to cell-taxonomy
  dont: invent a rule that approximates either
  harm: a shaky approximation duplicates another capability's gate with worse signal
  check: `grep -c "^    'observer-" src/index.ts` prints 2
```
