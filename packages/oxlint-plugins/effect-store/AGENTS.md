# AGENTS.md — `effect-store/`

> Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`.

Rules here gate the `*.store.ts` cell (the persistence leaf: `Effect.fn` functions over ONE aggregate, ACL-seam row↔domain crossings, injected DB port, domain-typed errors).

```yaml
- id: ES1
  title: Review-gated gates become lint via their mechanical subset
  do: derive rules only from single-file AST evidence the skill names — STO2 anti-patterns (driver imports, new Pool/Client/Database, process.env reads), the STO3 ACL import obligation, the STO4 _tag-branch subset, the module shape (Effect.fn exports), the stateless-leaf validity item (module-level mutable bindings/collections)
  dont: attempt STO1 (transaction monopoly — cross-file), the STO3 cast ban or error-mapping validity item (need type information), or STO4b's allowlist residual (needs domain judgment)
  harm: a rule needing cross-file or type knowledge cannot meet the mutation gate and misfires on sanctioned code
  check: "`grep -l 'isStoreFile' src/rules/*.ts` lists cell.ts and exactly the five rule implementations — the isStoreFile gate keys every rule on the `.store.ts` suffix and makes it no-op elsewhere — and `grep -oE 'store-[a-z-]+' src/index.ts | sort -u` lists exactly store-acl-required, store-effect-fn-required, store-no-domain-branch, store-no-driver-construction, store-no-escaping-state"
- id: ES2
  title: No _tag branch is sanctioned in a store
  do: flag if/ternary/switch reading `_tag` on any operand; flag `Match.value` only over ACL-derived values
  dont: gate `_tag` branches on ACL provenance like the executor rule does — the executor may dispatch on a workflow decision, the store may not
  harm: STO4b's allowlist covers only null/existence checks, which never read `_tag`; provenance-gating would let parameter branches through
  check: "`grep -oE 'Should_Pass_When_Existence_Check_On_Branded_Optional|Should_Report_Branch_When_If_Reads_Tag_On_A_Parameter' src/rules/__tests__/store-no-domain-branch.test.ts` returns both case names — the Option existence check and the parameter-`_tag` branch"
- id: ES3
  title: A computed member of the canonical namespace is still an exported Effect value
  do: count a computed `Effect['fn']` call as an exported Effect value under store-effect-fn-required, even though it is a near-miss for the canonical identifier match
  dont: let the computed form's near-miss status excuse the export from the fn-required obligation
  harm: the computed spelling names the same export surface as the canonical one; treating it like the invisible aliased spelling lets an exported Effect value escape the rule the cell exists to enforce
  check: "`grep -oE 'Should_Report_NonFnExport_When_Computed_EffectFn_Is_Used' src/rules/__tests__/store-effect-fn-required.test.ts` returns the computed-`Effect['fn']` report case that stays red while the aliased `Should_Pass_When_Aliased_Effect_Namespace_Is_Used` case stays green"
```
