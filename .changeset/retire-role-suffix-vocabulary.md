---
"@systemfsoftware/oxlint-plugin-cell-architecture": major
"@systemfsoftware/oxlint-plugin-dmmf-workflow": none
"@systemfsoftware/differential-spec": none
"@systemfsoftware/effect-atom": none
"@systemfsoftware/effect-atom-react": none
"@systemfsoftware/effect-cell-types": none
"@systemfsoftware/effect-daemon-spec": none
"@systemfsoftware/effect-gherkin-spec": none
"@systemfsoftware/effect-memfs": none
"@systemfsoftware/effect-microsandbox": none
"@systemfsoftware/effect-readiness": none
"@systemfsoftware/effect-schema-discovery": none
"@systemfsoftware/effect-schema-extensions": none
"@systemfsoftware/effect-schema-law": none
"@systemfsoftware/effect-schema-recursion-budget": none
"@systemfsoftware/effect-schema-vite": none
"@systemfsoftware/hex-schema": none
"@systemfsoftware/npm-package": none
"@systemfsoftware/oxlint-config-cell-architecture": none
"@systemfsoftware/oxlint-config-dmmf": none
"@systemfsoftware/oxlint-config-recommended": none
"@systemfsoftware/oxlint-plugin-effect-platform": none
"@systemfsoftware/oxlint-plugin-effect-schema": none
"@systemfsoftware/oxlint-plugin-test-discipline": none
"@systemfsoftware/rx-effect": none
"@systemfsoftware/storybook-gherkin": none
"@systemfsoftware/effect-spec-runtime": none
"@systemfsoftware/trace-spec": none
"@systemfsoftware/trace-taxonomy": none
---

`no-io-boundary-tests` is removed rather than renamed. It selected on the filename (`/\.(?:acl|store|adapter|handler)\.[cm]?tsx?$/`), so it could not fire on its own subject — an author writing a module that calls the filesystem does not name it `.acl.ts` — and two of the four suffixes it advertised matched no file in this tree. The verdict it was aimed at is already owned, decided from the module's own called non-type imports, by `oxlint-plugin-test-discipline`'s `no-io-module-in-source-test`; a second rule deriving the same verdict from the same imports would report every violation twice. Consumer configs naming `no-io-boundary-tests` must drop the entry.

The remaining `none` entries record touches that release nothing: no exported name changes.
