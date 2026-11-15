---
"@systemfsoftware/oxlint-plugin-test-discipline": minor
"@systemfsoftware/oxlint-config-recommended": minor
---

`e2e-tier-placement` now reads what a package and its tests are, instead of trusting a role a package declares about itself. The `e2e` role is removed; a leftover `role: 'e2e'` setting is ignored.

An end-to-end package ships nothing (no `src/` directory and no `exports`, `main`, `module` or `bin`) and holds a `tests/**/<subject>.e2e.ts`. In it, only `<subject>.e2e.ts` files may be tests, each must be a `makeFeature` Feature, and nothing under `tests/` may reach the repository's own code. That code is a relative import out of `tests/`, a `#` subpath import, the package's own name, an installed package linked to a directory outside every `node_modules`, or a dynamic import whose target cannot be read. Type imports, re-exports, `import()` and `require()` all count, and local modules under `tests/` are followed.

A `*.e2e.ts` file outside an end-to-end package's `tests/`, or inside `tests/__fixtures__/`, is reported. Inversely, a Feature outside an end-to-end package that reaches none of the repository's code is reported, because it is an end-to-end test under another name. A file is in the e2e lane by its name and place, so an `effect-e2e/runner` import no longer selects it.

To migrate, delete `role: 'e2e'` from the package's lint settings, and write each end-to-end test as a `makeFeature` Feature named `tests/<subject>.e2e.ts` that drives the running system.
