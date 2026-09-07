# Solution: Teaching the lint gates a DSL costs two config shapes, not one

## Problem

Converting a package's test suite to `@systemfsoftware/effect-gherkin-spec` features trips two unrelated gates whose fixes live in different config files, and the first fix attempt for each is silently wrong:

1. `vitest/no-standalone-expect` fires on every `expect` inside a `Then`/`Given`/`When` step, because the rule does not know the DSL's step names are test blocks. The obvious fix — a top-level `rules` entry with `additionalTestBlockFunctions` in the package `oxlint.config.ts` — never reaches test files: oxlint only applies the option through an `overrides` entry scoped by `files` (the shape all four stryker-js packages already carry). The `rules`-level attempt produces zero errors on a smoke file yet changes nothing in `tests/`, so the failure looks like a different bug than it is.
2. Adding `includeSource` to `vitest.config.ts` (to run in-source `import.meta.vitest` property blocks) changes how vitest processes the run's dependency graph, and the gherkin runner — which resolves `describe` as a global at runtime — starts failing every feature file with `ReferenceError: describe is not defined`. The fix is `globals: true` in the same `test` block; per-file `import { describe } from 'vitest'` additions are wrong (the runner, not the test file, resolves the global) and would have to be reverted again.

The observable failure of doing both wrong: a fully converted suite fails lint or runtime with errors that point at the DSL, the test files, or the workers — never at the two config lines that own the problem.

## Failure mechanisms

1. **Option-position laundering.** An oxlint rule option applied at the wrong config level reports nothing where it is placed and fires everywhere it does not reach. The tell: a one-file smoke check passes while the full package lint is unchanged.
2. **Transform-pipeline coupling.** `includeSource` is not a test-discovery setting only; it switches vitest's module processing for the whole run, and a runner that depends on injected globals stops seeing them. Adding a new test _kind_ to a config can break an unrelated test _kind_ in the same package.
3. **Rule-name aliasing.** `jest/no-standalone-expect` and `vitest/no-standalone-expect` share an implementation; fixing the wrong alias in config reads as "the fix did nothing."

## Invariants

- A package whose tests use the gherkin DSL carries the `overrides`-scoped `additionalTestBlockFunctions: ['Then', 'Given', 'When', 'And']` entry, and any other package adopting the DSL copies that entry's shape, not its prose.
- A package running in-source property blocks through `includeSource` sets `globals: true` in the same config whenever any dependency resolves runner globals by name.
- Rule-option fixes are verified against a file that actually matches the `files` pattern, never against a scratch file outside it.

## Verification

- `pnpm --filter <pkg> lint` exits 0 with the overrides entry present; deleting the entry makes every step-body `expect` fire (proving the entry is the thing that works).
- `pnpm --filter <pkg> test` runs the gherkin features and the in-source block green in one config; removing `globals: true` reintroduces the `describe` ReferenceError.
