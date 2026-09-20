# @systemfsoftware/oxlint-plugin-structure

Oxlint rules for module structure and export hygiene — classes stay out except where Effect v4 sanctions them, errors carry causes instead of strings, barrels and inline destructured types are forbidden, `@internal` JSDoc marks internal exports and nothing else, and I/O boundaries are verified by composition tests.

## Rules

| Rule                          | What it enforces                                                                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ban-classes`                 | Ban classes except where Effect v4 makes a class the sanctioned idiom (Context.Service, Schema.Class, Data.TaggedClass, Rpc factories, ...).                                 |
| `ban-error-string`            | Ban string coercion of error-like values. Use `{ cause }` to preserve the original error context.                                                                            |
| `no-barrels`                  | Detect barrel files (index.ts/mod.ts with re-exports) and barrel imports.                                                                                                    |
| `no-inline-destructured-type` | Ban inline object type annotations (TSTypeLiteral) on destructured function parameters in favor of named types or utility generics.                                          |
| `internal-export-jsdoc`       | Require a JSDoc `@internal` tag on every export whose file sits under a directory segment named internal.                                                                    |
| `no-internal-jsdoc-outside`   | Forbid a JSDoc `@internal` tag on any file whose path has no directory segment named internal.                                                                               |
| `no-io-boundary-tests`        | I/O boundary files (acl/store/adapter/handler) are verified by composition tests, never unit tests — not a `*.test.ts` file and not an in-source `import.meta.vitest` block. |

`ban-classes`, `no-barrels`, and `no-inline-destructured-type` ship in `rules` but are excluded from `configs.recommended`: `ban-classes` needs a per-package whitelist, and `no-barrels` and `no-inline-destructured-type` fire on correct code. A consumer enables those by name.

## Shared rule modules

`src/rules/` keeps two single-copy helpers — `internal-jsdoc.ts` and `internal-path.ts` — owned by this package. No other package's module is vendored here. No plugin vendors a copy of another's code, and plugins never depend on each other.

## Enrollment

Turned on by `@systemfsoftware/oxlint-config/base`, which spreads `configs.recommended.rules` of `@systemfsoftware/oxlint-plugin` — the aggregate re-registers every rule here under its own namespace.

## Testing

Each rule ships a RuleTester suite at `src/rules/__tests__/<rule>.test.ts`, with 100% mutation coverage required.
