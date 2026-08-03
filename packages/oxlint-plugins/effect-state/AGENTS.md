# AGENTS.md — `effect-state/`

> Delta only. Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`. Universal rules: root `AGENTS.md`.

Rules here gate the `architect-state` cell spec — read `skill://architect-state` for what a valid `*.state.ts` is. This leaf never restates it.

```yaml
- id: ES1
  title: Keep the obligation, not only prohibitions
  do: keep state-quarantine-holds-state registered — a *.state.ts that constructs no escaping coordination primitive at module scope is a misnamed service, and without the obligation the remaining rules pass vacuously on empty shells
  dont: drop it because raw-export and single-tag already reject empty files — a Tag-plus-Live service with all state operation-local passes those
  check: state-quarantine-holds-state is registered and enabled in configs.recommended

- id: ES2
  title: Escape, not construction — module scope is the judge
  do: count only module-scope constructions in holds-state and raw-primitive-exports; a Ref/Map/Deferred constructed inside a function or method is operation-local and stays inline in its host
  dont: treat operation-local primitives as satisfying the quarantine
  harm: the skill's granularity rule is the load-bearing distinction; blurring it manufactures shallow state cells
  check: every rule suite has a valid case proving an operation-local primitive does not fire

- id: ES3
  title: Tag detection matches the Context namespace only
  do: match the identifier Context.Tag in both the class-extends and const call-chain forms
  dont: also accept Context.GenericTag or an aliased Context import
  harm: mirror of EW4 — widening one detection rule makes its near-miss tests meaningless
  check: state-single-tag-export has a valid case proving Context.GenericTag does not fire

- id: ES4
  title: Adapter imports are value imports only
  do: flag only non-type imports of *.adapter.* sources in state files; `import type` is erased and harmless
  dont: flag type-only imports or folder names like ./adapters
  check: the adapter-import suite has valid cases for import type and for ./adapters
```
