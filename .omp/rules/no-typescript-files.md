---
description: Prevent TypeScript files in omp-typescript-discipline (rules only)
condition: '.*'
scope:
  - "tool:edit(omp/plugins/omp-typescript-discipline/**/*.ts)"
  - "tool:write(omp/plugins/omp-typescript-discipline/**/*.ts)"
  - "tool:edit(omp/plugins/omp-typescript-discipline/**/*.tsx)"
  - "tool:write(omp/plugins/omp-typescript-discipline/**/*.tsx)"
  - "tool:edit(omp/plugins/omp-typescript-discipline/**/*.mts)"
  - "tool:write(omp/plugins/omp-typescript-discipline/**/*.mts)"
  - "tool:edit(omp/plugins/omp-typescript-discipline/**/*.cts)"
  - "tool:write(omp/plugins/omp-typescript-discipline/**/*.cts)"
interruptMode: 'tool-only'
---

Don't add TypeScript files to `omp-typescript-discipline`. This plugin ships TTSR rules as markdown only — no runtime code, no fixtures. Adding `.ts` files bloats the package and reintroduces the boundary and fixture problems the previous cleanup removed.
