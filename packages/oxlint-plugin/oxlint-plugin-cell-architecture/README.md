# @systemfsoftware/oxlint-plugin-cell-architecture

Oxlint rules for module structure and export hygiene — classes must extend a sanctioned base or runtime constructor, errors carry causes instead of strings, `@internal` JSDoc marks internal exports and nothing else, and a module that performs I/O is verified from outside its own source.

## Rules

| Rule                              | What it enforces                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ban-classes`                     | Ban bare classes that do not extend a base class or constructor, routing with diagnostics to sanctioned Effect v4 idioms.  |
| `ban-error-string`                | Ban string coercion of error-like values. Use `{ cause }` to preserve the original error context.                          |
| `ban-unknown`                     | Ban `unknown` except as a generic default (`<A = unknown>`), a type-predicate parameter, or a catch binding.               |
| `cell-file-owns-no-lifecycle`     | Forbid a `*.cell.ts` file from registering a release or closing a scope; the resource and handle kinds own both.           |
| `handle-driver-confinement`       | Confine a handle's driver to its own methods and the integration; the driver never reaches caller code.                    |
| `handle-imports-no-resource`      | Forbid a `*.handle.ts` file from importing, re-exporting, or dynamically importing a `*.resource` module.                  |
| `internal-export-jsdoc`           | Require a JSDoc `@internal` tag on every export whose file sits under a directory segment named internal.                  |
| `kind-construction-location`      | Allow `Resource.make` only in `*.resource.ts` files and `Handle.make` only in `*.handle.ts` files.                         |
| `kind-file-construction`          | Require a `*.resource.ts` file to construct with `Resource.make` and a `*.handle.ts` file to construct with `Handle.make`. |
| `kind-file-declares-no-service`   | Forbid a `Context.Service` declaration in resource and handle files.                                                       |
| `kind-file-holds-no-module-state` | Forbid module-level `let`/`var`, mutable collections, or `Ref` in resource and handle files.                               |
| `no-internal-jsdoc-outside`       | Forbid a JSDoc `@internal` tag on any file whose path has no directory segment named internal.                             |

`ban-classes` is included in `configs.recommended`.

## Shared rule modules

`src/rules/` keeps the single-copy helpers this package owns: `internal-jsdoc.ts`, `internal-path.ts`, `kind-file.ts`, `kind-constructor.ts`, and `effect-origin.ts`. No other package's module is vendored here. No plugin vendors a copy of another's code, and plugins never depend on each other.

## Enrollment

Included in `@systemfsoftware/oxlint-config-cell-architecture`.

## Testing

Each rule ships a RuleTester suite at `src/rules/__tests__/<rule>.test.ts`, with 100% mutation coverage required.
