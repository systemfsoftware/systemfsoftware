# @systemfsoftware/oxlint-plugin-test-placement

Oxlint rules enforcing test placement and sanctioned suffixes, derived from the `architect-general-theory` B20 ruling and the `place-tests` permission matrix.

## Rules

| Rule                             | What it enforces                                                                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-test-file-in-src`            | Under `src/`, only `*.property.test.ts` and the generated `schema-laws.test.ts` entry point are allowed; `*.schema.test.ts` is forbidden outright.                                  |
| `src-property-test-cell`         | A property test under `src/` must be colocated with a `.workflow`, `.policy`, or `.schema` cell. A schema's authored test states only refusals — its round-trip laws are generated. |
| `in-source-test-targets-private` | An `if (import.meta.vitest)` block in a non-test file under `src/` must be at module level and exercise at least one non-exported binding.                                          |
| `test-file-outside-tests-dir`    | A test file outside `src/` must live under `tests/` or `__tests__/`.                                                                                                                |
| `test-suffix-outside-src`        | Outside `src/`, test files must end `.integration.test.ts` or `.feature.test.ts`.                                                                                                   |
| `feature-test-requires-gherkin`  | A `.feature.test.ts` must import `makeFeature` from `@systemfsoftware/effect-gherkin-spec` and must not import test runners directly from `vitest` or `@effect/vitest`.             |

## Enrollment

The rules are turned on by `@systemfsoftware/oxlint-config/strict`. The base config registers the plugin in `jsPlugins` but enables none of its rules, so a package that extends only `base` is unaffected.

## Testing

Each rule ships a RuleTester suite at `src/rules/__tests__/<rule>.test.ts`, with 100% mutation coverage required.
