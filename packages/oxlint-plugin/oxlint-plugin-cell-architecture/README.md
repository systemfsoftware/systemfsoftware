# @systemfsoftware/oxlint-plugin-cell-architecture

Oxlint rules for module structure and export hygiene — classes must extend a sanctioned base or runtime constructor, errors carry causes instead of strings, `@internal` JSDoc marks internal exports and nothing else, a module that performs I/O is verified from outside its own source, and the `*.blueprint.ts` / `*.handle.ts` cell kinds are held to the cell-architecture law (`compound-packs/cell-architecture/`).

## Rules

| Rule                              | What it enforces                                                                                                                                                                                                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ban-classes`                     | Ban bare classes that do not extend a base class or constructor, routing with diagnostics to sanctioned Effect v4 idioms.                                                                                                                                                                                        |
| `ban-error-string`                | Ban string coercion of error-like values. Use `{ cause }` to preserve the original error context.                                                                                                                                                                                                                |
| `ban-unknown`                     | Ban `unknown` except as a generic default (`<A = unknown>`), a type-predicate parameter, or a catch binding.                                                                                                                                                                                                     |
| `handle-definition-stays-private` | Forbid exporting the binding that holds a `Handle.make` result; the kind slot stays unnameable from consumer code.                                                                                                                                                                                               |
| `handle-exports-guard`            | Require an exported `is<Name>` guard bound to the handle definition's `is`.                                                                                                                                                                                                                                      |
| `internal-export-jsdoc`           | Require a JSDoc `@internal` tag on every export whose file sits under a directory segment named internal.                                                                                                                                                                                                        |
| `kind-file-construction`          | Require a `*.blueprint.ts` file to mint through `Blueprint.make` and a `*.handle.ts` file through `Handle.make`, both imported from `@systemfsoftware/effect-cell-types`. A retired `*.resource.ts` file is reported (rename to `*.blueprint.ts`; a blueprint is a cold description, never Effect's `Resource`). |
| `kind-file-declares-no-service`   | Forbid `Context.Service` / `Context.Tag` / `Context.Key` declarations in blueprint and handle files.                                                                                                                                                                                                             |
| `kind-file-holds-no-module-state` | Forbid module-level `let`/`var`, mutable collections, Refs, or arrays/objects mutated later in blueprint and handle files.                                                                                                                                                                                       |
| `kind-record-minted-by-kind`      | Forbid object literals spreading `Pipeable.Prototype` or carrying a computed `[TypeId]` key in blueprint and handle files.                                                                                                                                                                                       |
| `kind-typeid-by-symbol-for`       | Require the file's exported `TypeId` to be `Symbol.for('<literal>')` and forbid every other `Symbol` declaration.                                                                                                                                                                                                |
| `no-internal-jsdoc-outside`       | Forbid a JSDoc `@internal` tag on any file whose path has no directory segment named internal.                                                                                                                                                                                                                   |
| `no-bodyless-status-assertion`    | Forbid asserting an HTTP response status without surfacing the response body on failure.                                                                                                                                                                                                                         |
| `no-context-generic-tag`          | Ban `Context.GenericTag`; a v4 service is declared with `Context.Service`.                                                                                                                                                                                                                                       |
| `no-direct-tag-access`            | Ban direct `_tag` access except in comparisons the rule allows.                                                                                                                                                                                                                                                  |
| `no-either-tag-assertions`        | Ban Either `_tag` assertions in test files; assert the full value instead.                                                                                                                                                                                                                                       |

| `no-context-generic-tag` | Ban `Context.GenericTag`; a v4 service is declared with `Context.Service`. |
| `no-direct-tag-access` | Ban direct `_tag` access; the allowed expressions are configurable. |
| `no-either-tag-assertions` | Ban Either `_tag` assertions in test files; use `expect().toEqual(Either.left/right(...))` instead. |
| `sandwich-shell-is-straight-line` | Refuse control flow, `Match` pipelines, and clock reads inside the read and write phases of a Sandwich cell. |
| `medium-owns-no-recovery` | Refuse `Effect.retry`, `Effect.retryOrElse`, `Effect.forever` and `Stream.retry` inside the ports of `Supervisor.Medium.make`. |

Both kernel-boundary rules resolve their builders by import origin and are included in `configs.recommended`.

`ban-classes` is included in `configs.recommended`.

## Shared rule modules

`src/rules/` keeps the single-copy helpers this package owns: `internal-jsdoc.ts`, `internal-path.ts`, `kernel-boundary.ts` (the node walk and boundary resolution shared by the kernel-boundary rules), `kind-file.ts` (suffix keying), `module-origin.ts` (import-origin resolution for the kinds), and `module-scope.ts` (module-level declarations, export surface, AST walk). No other package's module is vendored here. No plugin vendors a copy of another's code, and plugins never depend on each other.

## Enrollment

Included in `@systemfsoftware/oxlint-config-cell-architecture`. The kind rules (`handle-definition-stays-private`, `handle-exports-guard`, `kind-file-construction`, `kind-file-declares-no-service`, `kind-file-holds-no-module-state`, `kind-record-minted-by-kind`, `kind-typeid-by-symbol-for`) are enrolled in `configs.recommended` at `error`.

## Testing

Each rule ships a RuleTester suite at `src/rules/__tests__/<rule>.test.ts`, with 100% mutation coverage required.
