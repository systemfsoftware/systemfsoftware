---
description: Prevent adding effect as a dependency to omp-typescript-discipline
condition: '"effect"'
scope:
  - "tool:edit(omp/plugins/omp-typescript-discipline/package.json)"
  - "tool:write(omp/plugins/omp-typescript-discipline/package.json)"
interruptMode: 'tool-only'
---

Don't add `effect` as a dependency to `omp-typescript-discipline`. This plugin is TTSR rules only — dependency-free by design. Adding `effect` breaks `turbo boundaries` and bloats the rule package. Use `jsr:@std/*` or `Effect` via the consumer's own package, not this plugin's manifest.
