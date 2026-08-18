---
'@systemfsoftware/stryker-js-mutation-run': patch
'@systemfsoftware/stryker-js-plugin-api': patch
'@systemfsoftware/stryker-js-typescript-checker': patch
'@systemfsoftware/stryker-js-vitest-runner': patch
---

These packages no longer ship their development files. Sources, tests and build, lint and
test configuration were all included, which broke consumers in one specific way: oxlint
discovers configuration by walking directories, finds the published `oxlint.config.ts` under
`node_modules`, and stops with "Stripping types is currently unsupported for files under
node_modules" before linting anything.

The installed package now contains the compiled output, the runtime schema files it reads,
and the usual manifest, README and licence
