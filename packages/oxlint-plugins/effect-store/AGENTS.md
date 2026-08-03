# AGENTS.md — `effect-store/`

> Delta only. Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`. Universal rules: root `AGENTS.md`.

Rules here gate the `architect-store` cell spec (`*.store.ts` — the persistence leaf: `Effect.fn` functions over ONE aggregate, ACL-seam row↔domain crossings, injected DB port, domain-typed errors). Read the cell skill for what a store must be; restating it here would create a second copy that drifts.

```yaml
- id: ES1
  title: Review-gated gates become lint via their mechanical subset
  do: derive rules only from single-file AST evidence the skill names — STO2 anti-patterns (driver imports, new Pool/Client/Database, process.env reads), the STO3 ACL import obligation, the STO4 _tag-branch subset, the module shape (Effect.fn exports), the stateless-leaf validity item (module-level mutable bindings/collections)
  dont: attempt STO1 (transaction monopoly — cross-file), the STO3 cast ban or error-mapping validity item (need type information), or STO4b's allowlist residual (needs domain judgment)
  harm: a rule needing cross-file or type knowledge cannot meet the mutation gate and misfires on sanctioned code
  check: every rule keys on the `.store.ts` suffix and no-ops elsewhere; the five rules are store-acl-required, store-effect-fn-required, store-no-domain-branch, store-no-driver-construction, store-no-escaping-state
- id: ES2
  title: No _tag branch is sanctioned in a store
  do: flag if/ternary/switch reading `_tag` on any operand; flag `Match.value` only over ACL-derived values
  dont: gate `_tag` branches on ACL provenance like the executor rule does — the executor may dispatch on a workflow decision, the store may not
  harm: STO4b's allowlist covers only null/existence checks, which never read `_tag`; provenance-gating would let parameter branches through
  check: store-no-domain-branch has a valid case matching an Option existence check and an invalid case branching on a parameter `_tag`
- id: ES3
  title: Effect detection matches the canonical identifier only
  do: recognize `Effect.fn` on the `Effect` namespace only; treat `E.fn`, curried `Effect.fn()(...)`, and computed `Effect['fn']` as documented near-misses (computed still counts as an exported Effect value)
  dont: widen detection to aliases
  harm: every rule here hardcodes a canonical identifier (EW4); widening one makes its near-miss tests meaningless and puts it out of step with its siblings
  check: store-effect-fn-required has a valid case for an aliased `E.fn` export
```
