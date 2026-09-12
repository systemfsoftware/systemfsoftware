# Oxlint namespace cutover — external-consumer audit and suppression measurement

Measured 2026-09-12 for U0(a)/(b) of `docs/plans/2026-09-12-0311-refactor-composable-oxlint-presets-plan.md`. Delivery B's breaking changesets cite this file (R12).

## U0(a) — disable-comment population for the dying namespaces

Grep over the tree for `oxlint-disable` comments naming any of the three dying id forms
(`@systemfsoftware/oxlint-plugin/<rule>`, `@systemfsoftware/effect-dmmf/<rule>`,
`@systemfsoftware/oxlint-plugin-effect-dmmf/<rule>`):

**0 matches.** No suppression breaks silently in this cutover.

One straggler names the config-key form instead:

- `packages/stryker-js/stryker-js-instrumenter/src/print/index.ts:8` —
  `// oxlint-disable typescript/no-unsafe-type-assertion … @systemfsoftware/ban-classes`

`ban-classes` is one of the 19 rules the `@systemfsoftware/oxlint-plugin` aggregate re-keys; after the
cutover its id becomes `<owning leaf package>/ban-classes`, so this one comment is re-keyed in U9's sweep
(the R11 "at-most-two named-rule id updates" population: this disable plus any config-file literal
references — the census counted two consumer configs naming custom rules explicitly).

## U0(b) — external-consumer audit

npm weekly downloads (registry API, 2026-09-04 → 2026-09-10):

| package                                      | downloads/wk | published?                                                        |
| -------------------------------------------- | ------------ | ----------------------------------------------------------------- |
| `@systemfsoftware/all`                       | 480          | yes                                                               |
| `@systemfsoftware/oxlint-plugin`             | 317          | yes                                                               |
| `@systemfsoftware/oxlint-plugin-effect-dmmf` | 486          | yes                                                               |
| `@systemfsoftware/oxlint-config`             | —            | **no (404)** — in-repo only; its 19 consumers are all first-party |

Public code search (grep.app over indexed GitHub, excluding `systemfsoftware/systemfsoftware`):

- `"@systemfsoftware/oxlint-plugin-effect-dmmf"` → 0 results
- `"@systemfsoftware/all" oxlint` → 0 results

**Migration-cost conclusion:** no externally-identifiable consumer population exists for any broken
surface. The download counts have no indexed usage behind them (mirror/bot traffic or private unindexed
consumers). The breaking changesets for `all` (major) and the two deleted aggregates must still name the
suppression-id migration per R12, but no external migration program is warranted. The in-repo population
is fully enumerated: 19 `base` consumers (flipped by the follow-up strict-enrollment plan) and 6
`all` consumers (migrated to `defaultIgnores` in U4).
