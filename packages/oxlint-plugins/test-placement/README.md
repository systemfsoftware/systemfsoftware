# @systemfsoftware/oxlint-plugin-test-placement

Oxlint rules enforcing test placement and sanctioned suffixes, derived from the `architect-general-theory` B20 ruling and the `place-tests` permission matrix.

## Rules

| Rule                              | What it enforces                                                                                                                                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `no-test-file-in-src`             | Under `src/`, only `*.property.test.ts` and the generated `schema-laws.test.ts` entry point are allowed; `*.schema.test.ts` is forbidden outright.                                                                                                                             |
| `src-property-test-cell`          | A property test under `src/` must be colocated with a `.workflow`, `.policy`, or `.schema` cell. A schema's authored test states only refusals — its round-trip laws are generated.                                                                                            |
| `in-source-test-targets-private`  | An `if (import.meta.vitest)` block in a non-test file under `src/` must be at module level and exercise at least one non-exported binding.                                                                                                                                     |
| `test-file-outside-tests-dir`     | A test file outside `src/` must live under `tests/` or `__tests__/`.                                                                                                                                                                                                           |
| `test-suffix-outside-src`         | Outside `src/`, a test file must end `.integration.test.ts` or `.snapshot.test.ts` — the one behaviour suffix and the one snapshot suffix.                                                                                                                                     |
| `snapshot-test-requires-snapshot` | A `.snapshot.test.ts` must contain at least one snapshot assertion (`toMatchSnapshot`, `toMatchInlineSnapshot`, `toMatchFileSnapshot`, or `toThrowErrorMatchingSnapshot`). The suffix admits a kind exempt from the behaviour rules; the body must still pin a stored fixture. |
| `behaviour-test-requires-gherkin` | A `.integration.test.ts` must import `makeFeature` from `@systemfsoftware/effect-gherkin-spec` and must not import test runners directly from `vitest` or `@effect/vitest`.                                                                                                    |
| `behaviour-exercises-use-case`    | A `.integration.test.ts` must reach at least one shell entry — an executor/handler/adapter/store, the package `main`/`mod`/`index`, or a non-foundation package — so it drives a use case.                                                                                     |
| `behaviour-one-feature-per-file`  | A `.integration.test.ts` must contain exactly one `Feature(...)` call; zero or two-or-more is the junk-drawer signal.                                                                                                                                                          |

| suffix                  | layer     | doubles                  | location           |
| ----------------------- | --------- | ------------------------ | ------------------ |
| `*.property.test.ts`    | Property  | none — pure core         | ONLY under `src/`  |
| `*.integration.test.ts` | Behaviour | permitted, at ports only | NEVER under `src/` |
| `*.snapshot.test.ts`    | Snapshot  | none — fixed-seed sample | NEVER under `src/` |

## Enrollment

The rules are turned on by `@systemfsoftware/oxlint-config/strict`. The base config registers the plugin in `jsPlugins` but enables none of its rules, so a package that extends only `base` is unaffected.

## Testing

Each rule ships a RuleTester suite at `src/rules/__tests__/<rule>.test.ts`, with 100% mutation coverage required.
