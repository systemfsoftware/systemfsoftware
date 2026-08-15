# @systemfsoftware/oxlint-plugin-test-placement

Oxlint rules enforcing test placement and sanctioned suffixes, following the `place-tests` permission matrix.

## Rules

| Rule                              | What it enforces                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-test-file-in-src`             | Under `src/`, a test is allowed only inside a sanctioned test directory and only when its stem names a colocatable cell — in whichever form the behaviour needs, a law or a characterization test — plus the generated `schema-laws.test.ts` entry point; `*.schema.test.ts` is forbidden outright.                                                                                    |
| `src-property-test-cell`          | A property test under `src/` must be colocated with the pure cell it covers: a `.workflow`, a `.policy`, or a `.kernel`. A schema may carry one only for a `refutes(schema, generators)` refusal — its round-trip laws are generated. A source file whose suffix names a cell listed in `cellsRequiringTest` must also carry an in-source vitest block; that list is empty by default. |
| `in-source-test-targets-private`  | An `if (import.meta.vitest)` block in a non-test file under `src/` must be at module level and exercise at least one non-exported binding.                                                                                                                                                                                                                                             |
| `test-file-outside-tests-dir`     | A test file outside `src/` must live under `__tests__/`.                                                                                                                                                                                                                                                                                                                               |
| `test-suffix-outside-src`         | Outside `src/`, a test file must end `.integration.test.ts` — the one behaviour suffix.                                                                                                                                                                                                                                                                                                |
| `behaviour-test-requires-gherkin` | A `.integration.test.ts` must import `makeFeature` from `@systemfsoftware/effect-gherkin-spec` and must not import test runners directly from `vitest` or `@effect/vitest`.                                                                                                                                                                                                            |
| `behaviour-exercises-use-case`    | A `.integration.test.ts` must reach at least one shell entry — an executor/handler/adapter/store, the package `main`/`mod`/`index`, or a non-foundation package — so it drives a use case.                                                                                                                                                                                             |
| `behaviour-one-feature-per-file`  | A `.integration.test.ts` must contain exactly one `Feature(...)` call; zero or two-or-more is the junk-drawer signal.                                                                                                                                                                                                                                                                  |

| suffix                  | layer     | doubles                  | location           |
| ----------------------- | --------- | ------------------------ | ------------------ |
| `*.property.test.ts`    | Property  | none — pure core         | ONLY under `src/`  |
| `*.integration.test.ts` | Behaviour | permitted, at ports only | NEVER under `src/` |

## Enrollment

The rules are turned on by `@systemfsoftware/oxlint-config/base`, which spreads `@systemfsoftware/oxlint-plugin-effect-dmmf`'s recommended set; that aggregate re-exports all eight under the `@systemfsoftware/effect-dmmf/` namespace, so a package extending only `base` already enforces them. `strict` adds three TypeScript rules and nothing from this plugin. Neither preset registers this plugin standalone in `jsPlugins`, so its own `recommended` config is never the thing being loaded.

## Testing

Each rule ships a RuleTester suite at `src/rules/__tests__/<rule>.test.ts`, with 100% mutation coverage required.
