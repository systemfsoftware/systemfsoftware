---
"@systemfsoftware/oxlint-plugin-dmmf-workflow": major
"@systemfsoftware/oxlint-config-dmmf": major
"@systemfsoftware/oxlint-config-recommended": major
"@systemfsoftware/oxlint-plugin-effect-schema": patch
---

Add `decision-code-imports` to the recommended config at `error`. Decision code is every `*.workflow.ts` and `*.schema.ts` file under a package's `src/`, and it may reach only other decision code across the whole file, not only inside a `Workflow.make` body. A runtime reference may resolve only to:

- `effect` and `@systemfsoftware/effect-cell-types`;
- a relative module whose basename ends `.schema.js`, `.schema.ts`, `.workflow.js` or `.workflow.ts`;
- a binding imported from a package of the enclosing pnpm workspace, used only as a schema: in a type, as an argument to an `S.*` or `Schema.*` call (directly, or through a `const` record of schemas passed to one), or as the receiver of `.make`, `.is`, `.fields`, `.ast` or `.annotations`;
- a package listed under `kernels` in `decision-code.json`.

The rule reports an import of a plain relative module or of any other package, a call, alias or destructuring of a workspace binding, `import()`, `require()` and `export … from`. Type-only imports and an `if (import.meta.vitest)` block are not read.

The rule cannot be silenced from inside the file: it reports any inline `oxlint-disable` or `eslint-disable` directive that would silence it. A repo carries its existing offenders by exact repo-relative path in the `legacy` list of `decision-code.json` at its workspace root, and the rule reports a listed file once it has nothing left to carry. Every `kernels` entry names the `proof` target that shows the package is pure. A malformed `decision-code.json` is reported on every decision file.

**Breaking:** decision files that import formatting or other plain modules, or call workspace functions, now fail lint. To migrate, move the code into the decision file or into the `*.schema.ts` file of the type it operates on, or list the file in `legacy` until it is cleared.

`@systemfsoftware/oxlint-plugin-effect-schema` behaves the same; its workspace and in-source-test helpers moved into the shared kernel.
