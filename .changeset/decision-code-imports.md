---
"@systemfsoftware/oxlint-plugin-dmmf-workflow": major
"@systemfsoftware/oxlint-config-dmmf": major
"@systemfsoftware/oxlint-config-recommended": major
"@systemfsoftware/oxlint-plugin-effect-schema": patch
"@systemfsoftware/effect-gherkin-spec": patch
---

Add `decision-code-imports` to the recommended config at `error`. Decision code is every `*.workflow.ts` and `*.schema.ts` file under a package's `src/`. It may reach only other decision code, across the whole file and not only inside a `Workflow.make` body. A runtime reference may resolve only to:

- `effect` and `@systemfsoftware/effect-cell-types`;
- a relative import that resolves to a `*.schema.ts` or `*.workflow.ts` file under the same package's `src/`;
- a binding imported from a package of the enclosing pnpm workspace, used only as a schema. That means in a type, as an argument to an `S.*` or `Schema.*` call (directly, through either branch of a conditional, or through a `const` record of schemas passed to one), or as the receiver of `.make`, `.is`, `.fields`, `.ast` or `.annotations`;
- a package listed under `kernels` in `decision-code.json` at the workspace root, whose `proof` names an existing file in the repo.

The rule reports:

- an import of any other relative module, including a `.schema`-suffixed path outside the package's `src/` or one that resolves to a directory;
- an import of any other package;
- a side-effect import of a workspace package;
- a call, alias or destructuring of a workspace binding;
- `import()`, any reference to `require`, `import = require()` and `export … from`.

Type-only imports and an `if (import.meta.vitest)` block are not read. The rule cannot be silenced from inside the file: it reports any inline `oxlint-disable` or `eslint-disable` directive that would silence it. No list exempts existing offenders.

**Breaking:** a repo whose decision files import formatting or other plain modules, import other packages, or call workspace functions now fails lint. To migrate, move presentation into a plain module that the write edge calls, and move decision logic into the decision file or the `*.schema.ts` file of the type it operates on.

`StepError` in `@systemfsoftware/effect-gherkin-spec` keeps the same fields, encoded shape and `message`. Its cause summary is now appended by `StepError` in a plain module, outside the schema file that declares its fields.

`@systemfsoftware/oxlint-plugin-effect-schema` behaves the same; its workspace and in-source-test helpers moved into the shared kernel.
