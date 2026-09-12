---
'@systemfsoftware/conventions': minor
---

New package: a composable, GritQL-first conventions platform. Ships the `conventions` bin over the exact-pinned grit engine (`@getgrit/cli` 0.1.0-alpha.1743007075), a bundled rule library (first rule: `require_tsconfig_node_reference` — every first-party tsconfig.json declares its node-project reference), `--rules` composition for any consumer GritQL pattern, `--ignore` exemptions, and the exit contract `0 clean · 1 findings · 2 broken instrument`. Engine resolves PATH-first; works offline in sandboxes.
