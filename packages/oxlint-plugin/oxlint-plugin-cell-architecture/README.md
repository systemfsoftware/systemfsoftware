# @systemfsoftware/oxlint-plugin-cell-architecture

Oxlint rules for module structure and export hygiene — classes must extend a sanctioned base or runtime constructor, errors carry causes instead of strings, `@internal` JSDoc marks internal exports and nothing else, and I/O boundaries are verified by composition tests.

## Rules

| Rule                        | What it enforces                                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ban-classes`               | Ban bare classes that do not extend a base class or constructor, routing with diagnostics to sanctioned Effect v4 idioms.                                                    |
| `ban-error-string`          | Ban string coercion of error-like values. Use `{ cause }` to preserve the original error context.                                                                            |
| `ban-unknown`               | Ban `unknown` except as a generic default (`<A = unknown>`), a type-predicate parameter, or a catch binding.                                                                 |
| `internal-export-jsdoc`     | Require a JSDoc `@internal` tag on every export whose file sits under a directory segment named internal.                                                                    |
| `no-internal-jsdoc-outside` | Forbid a JSDoc `@internal` tag on any file whose path has no directory segment named internal.                                                                               |
| `no-io-boundary-tests`      | I/O boundary files (acl/store/adapter/handler) are verified by composition tests, never unit tests — not a `*.test.ts` file and not an in-source `import.meta.vitest` block. |

`ban-classes` is included in `configs.recommended`.

## Shared rule modules

`src/rules/` keeps two single-copy helpers — `internal-jsdoc.ts` and `internal-path.ts` — owned by this package. No other package's module is vendored here. No plugin vendors a copy of another's code, and plugins never depend on each other.

## Enrollment

Included in `@systemfsoftware/oxlint-config-cell-architecture`.

## Testing

Each rule ships a RuleTester suite at `src/rules/__tests__/<rule>.test.ts`, with 100% mutation coverage required.
