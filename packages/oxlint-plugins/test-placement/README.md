# @systemfsoftware/oxlint-plugin-test-placement

Oxlint rules enforcing test placement and sanctioned suffixes, following the `place-tests` permission matrix.

## Rules

| Rule                              | What it enforces                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-test-file-in-src`             | Under `src/`, the only sanctioned test file is a single-segment `<stem>.workflow.property.test.ts` inside a sanctioned test directory, plus the generated `schema-laws.test.ts` entry point. Every other test file is banned: a kernel, policy, or schema suite becomes an in-source `import.meta.vitest` block, and a public-surface test moves outside `src/` as an integration test. |
| `src-property-test-cell`          | A property test under `src/` must be a single-segment `<stem>.workflow.property.test.ts` beside the `<stem>.workflow.ts` it covers. A source file whose suffix names a cell listed in `cellsRequiringTest` must also carry an in-source vitest block; that list is empty by default.                                                                                                    |
| `in-source-test-targets-private`  | An `if (import.meta.vitest)` block in a non-test file under `src/` must be at module level and exercise at least one non-exported binding.                                                                                                                                                                                                                                              |
| `test-file-outside-tests-dir`     | A test file outside `src/` must live under `tests/`.                                                                                                                                                                                                                                                                                                                                    |
| `test-suffix-outside-src`         | Outside `src/`, a test file must end `.integration.test.ts` — the one behaviour suffix.                                                                                                                                                                                                                                                                                                 |
| `tests-dir-helpers-in-fixtures`   | Under `tests/`, the only non-test modules are helpers and fixtures, and they live inside `tests/__fixtures__/`.                                                                                                                                                                                                                                                                         |
| `behaviour-test-requires-gherkin` | A `.integration.test.ts` must import `makeFeature` from `@systemfsoftware/effect-gherkin-spec` and must not import test runners directly from `vitest` or `@effect/vitest`.                                                                                                                                                                                                             |
| `behaviour-exercises-use-case`    | A `.integration.test.ts` must reach at least one shell entry — an executor/handler/adapter/store, the package `main`/`mod`/`index`, or a non-foundation package — so it drives a use case.                                                                                                                                                                                              |
| `behaviour-one-feature-per-file`  | A `.integration.test.ts` must contain exactly one `Feature(...)` call; zero or two-or-more is the junk-drawer signal.                                                                                                                                                                                                                                                                   |

| suffix                        | layer     | doubles                  | location           |
| ----------------------------- | --------- | ------------------------ | ------------------ |
| `*.workflow.property.test.ts` | Property  | none — pure core         | ONLY under `src/`  |
| `*.integration.test.ts`       | Behaviour | permitted, at ports only | NEVER under `src/` |

## Enrollment

The rules are turned on by `@systemfsoftware/oxlint-config/base`, which spreads `@systemfsoftware/oxlint-plugin-effect-dmmf`'s recommended set; that aggregate re-exports all nine under the `@systemfsoftware/effect-dmmf/` namespace, so a package extending only `base` already enforces them. `strict` adds three TypeScript rules and nothing from this plugin. Neither preset registers this plugin standalone in `jsPlugins`, so its own `recommended` config is never the thing being loaded.

## Testing

Each rule ships a RuleTester suite at `src/rules/__tests__/<rule>.test.ts`, with 100% mutation coverage required.
