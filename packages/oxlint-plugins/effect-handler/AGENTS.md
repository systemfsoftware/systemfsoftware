# AGENTS.md — `effect-handler/`

> Delta only. Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`. Universal rules: root `AGENTS.md`.

Rules here gate the `architect-handler` cell spec. Read the cell skill for what a handler must be — restating it here would create a second copy that drifts.

```yaml
- id: HH1
  title: handler-single-executor is this cell's OX-OB1 obligation
  do: keep handler-single-executor failing a handler that LACKS an executor import or an Effect.either delegation
  dont: relax handler-single-executor so it fires only when an executor import is already present
  harm: with prohibitions alone, a handler that calls a store directly and never delegates passes every rule and HD1 is vacuous
  check: handler-single-executor is registered and enabled in configs.recommended

- id: HH4
  title: Identifier matching hardcodes the family names
  do: match the identifiers Effect, Match, and the cell suffixes exactly
  dont: accept aliases (effectEither, M.tag) or extra namespaces
  harm: every rule here hardcodes the canonical spelling; widening one makes its near-miss tests meaningless and puts it out of step with its siblings
  check: each identifier-matching rule has a valid near-miss case proving the alias does not fire

- id: HH5
  title: Deliberate non-gates
  do: leave HD4/HD4b (no branches on schema-exported types) and the HD2 decode obligation to review
  dont: attempt them as syntax rules
  harm: both are type-aware (the skill's own rationale names the mechanical subset type-aware); a syntax proxy would false-positive on the skill's canonical HttpServerRequest.param example
  check: no rule in this package keys on a value's declared type
```
