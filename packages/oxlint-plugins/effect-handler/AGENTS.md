# AGENTS.md — `effect-handler/`

> Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`.

```yaml
- id: HH1
  title: handler-single-executor — the obligation rule OX-OB1 requires here
  do: keep handler-single-executor failing a handler that LACKS an executor import or an Effect.either delegation
  dont: relax handler-single-executor so it fires only when an executor import is already present
  harm: with prohibitions alone, a handler that calls a store directly and never delegates passes every rule and HD1 is vacuous
  check: `grep -c "rule('handler-single-executor')]: 'error'" src/index.ts` prints 1 — its only registration, in configs.recommended

- id: HH4
  title: Identifier matching hardcodes the family names
  do: match the identifiers Effect, Match, and the cell suffixes exactly
  dont: accept aliases (effectEither, M.tag) or extra namespaces
  harm: every rule here hardcodes the canonical spelling; widening one makes its near-miss tests meaningless and breaks the canonical-spelling contract every sibling rule shares
  check: `pnpm --filter @systemfsoftware/oxlint-plugin-effect-handler test` exits 0 — it pins the near-miss valid cases (a non-Effect object with an .either method, a someOther.type namespace, a switch outside the cell) that must not fire

- id: HH5
  title: Deliberate non-gates
  do: leave HD4/HD4b (no branches on schema-exported types) and the HD2 decode obligation to review
  dont: attempt them as syntax rules
  harm: both are type-aware (the skill's own rationale names the mechanical subset type-aware); a syntax proxy would false-positive on the skill's canonical HttpServerRequest.param example
  check: review — no rule in this package keys on a value's declared type
```
