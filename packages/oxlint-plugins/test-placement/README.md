# @systemfsoftware/oxlint-plugin-test-placement

Oxlint rules enforcing test placement and sanctioned suffixes, derived from the `architect-general-theory` B20 ruling and the `place-tests` permission matrix.

## Rules

| Rule                             | What it enforces                                                                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-test-file-in-src`            | Under `src/`, only `*.property.test.ts` test files are allowed.                                                                                                         |
| `src-property-test-cell`         | A property test under `src/` must be colocated with a `.workflow`, `.schema`, or `.policy` cell.                                                                        |
| `in-source-test-targets-private` | An `if (import.meta.vitest)` block in a non-test file under `src/` must be at module level and exercise at least one non-exported binding.                              |
| `test-file-outside-tests-dir`    | A test file outside `src/` must live under `tests/` or `__tests__/`.                                                                                                    |
| `test-suffix-outside-src`        | Outside `src/`, test files must end `.integration.test.ts` or `.feature.test.ts`.                                                                                       |
| `feature-test-requires-gherkin`  | A `.feature.test.ts` must import `makeFeature` from `@systemfsoftware/effect-gherkin-spec` and must not import test runners directly from `vitest` or `@effect/vitest`. |

## Enrollment

The rules are opt-in per package, via `@systemfsoftware/oxlint-config/test-placement`. The base config registers the plugin but does not enable its rules. Enroll a package by extending the test-placement preset.

## Testing

Each rule ships a RuleTester suite at `src/rules/__tests__/<rule>.test.ts`, with 100% mutation coverage required.
