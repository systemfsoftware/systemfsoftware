# AGENTS.md — `effect-dmmf/`

> Shared rule-authoring conventions: `packages/oxlint-plugins/AGENTS.md`.

This package is the ONE-SHOT bundle: a consumer installs `@systemfsoftware/oxlint-plugin-effect-dmmf`, registers it as the single `jsPlugin`, and gets every remaining architecture rule in the family — property-testing, test-hygiene, test-placement, effect-schema and effect-workflow — under one entrypoint. The cell-role plugin fleet was deleted wholesale in the cell-taxonomy collapse (2026-08-16), so `src/index.ts` is a plain object spread over the five surviving sources with a `recommendedFrom` helper that re-exports all of a source's `rules` but recommends only the entries that source's own `configs.recommended.rules` carries. It has no rule logic and no AST visitor of its own — see `README.md#development`.

```yaml
- id: ED1
  title: Aggregation is tested, not trusted
  do: verify, on every change to `src/index.ts`, that (a) no two sources share a rule name, (b) core is absent, (c) every source-recommended rule is enabled under this bundle's own plugin name; a colocated suite at `src/__tests__/` importing the real source plugins is the mechanization this is waiting for
  dont: drop the collision check, reintroduce fixture plugins, or special-case a source's rule names — the check exists because a plain object spread silently drops duplicates
  harm: the five surviving sources aggregated by hand WILL collide eventually; a dropped duplicate either fails the bundle (missing rule) or, worse, silently overrides an identically-named rule from a sibling source — the suite is the only thing that names the colliding rule and both owners
  check: "review — no two sources in the bundle entrypoint share a rule name, core is absent, and every source-recommended rule is enabled under the bundle's own plugin name. Reviewer-checked, not mechanized: `src/__tests__/` does not exist, and naming a command here that no one can run green would make this rule look enforced while proving nothing"

- id: ED2
  title: Core is excluded by contract
  do: keep @systemfsoftware/oxlint-plugin (core) out of the src/index.ts imports, the dependencies map, and the bundle's rules — its rule names must appear in NONE of the exported rule keys
  dont: add core to the aggregation because "it's just a few more rules" — core is a junk drawer of general-purpose rules, its package name is banned by CONSTITUTION.md IV.2, and the one-shot bundle's whole point is a curated architecture surface
  harm: bundling a junk drawer into the DMMF family muddies the curated surface, invites rule-name collisions with the real cell plugins, and violates the naming constitution
  check: "`grep -c \"from '@systemfsoftware/oxlint-plugin'\" src/index.ts` returns 0 — core's bare specifier is absent from the imports; the stronger claim (zero overlap between core's rule names and this bundle's exported keys) is unenforced while `src/__tests__` does not exist"

- id: ED3
  title: Aggregation rules read configs.recommended generically
  do: when adding or removing a source plugin, wire it through recommendedFrom exactly like the others — re-export all of its rules, recommend only what its own configs.recommended.rules names
  dont: hardcode any source's rule names into src/index.ts, or assume every source ships a configs.recommended block (test-hygiene did not until 2026-08-01)
  harm: hardcoding bypasses the generic read and silently skips future sources that register rules without recommending them, or invents recommendations a source never made
  check: review — every source appears exactly once in both the rules spread and the configs.recommended spread
```
