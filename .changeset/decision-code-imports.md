---
"@systemfsoftware/oxlint-plugin-dmmf-workflow": major
"@systemfsoftware/oxlint-config-dmmf": major
"@systemfsoftware/oxlint-config-recommended": major
"@systemfsoftware/oxlint-plugin-effect-schema": patch
"@systemfsoftware/effect-gherkin-spec": minor
---

Add `decision-code-imports` to the recommended config at `error`. Decision code is every `*.workflow.ts` and `*.schema.ts` file under a package's `src/`. It may reach only other decision code, across the whole file and not only inside a `Workflow.make` body. A runtime reference may resolve only to:

- `effect` and `@systemfsoftware/effect-cell-types`;
- a relative import whose real path, after symlinks, is a `*.schema.ts` or `*.workflow.ts` file under the same package's real `src/`;
- a binding imported from a package of the enclosing pnpm workspace, used only as a schema:
  - in a type;
  - as a schema argument of an `S.*` or `Schema.*` call. Annotation, filter, transformation and `pipe` arguments are not schema arguments, and `decodeTo`/`encodeTo` take a schema only as their first argument;
  - as a field value of the fields object of `Struct`, `TaggedStruct`, `Class`, `ErrorClass`, `TaggedClass` or `TaggedError`;
  - as an element of the members of `Union`, `Tuple` or `Literals`;
  - through either branch of a conditional, or through a `const` record used in one of those positions;
  - as the receiver of `.make`, `.is`, `.fields`, `.ast` or `.annotations`;
- a package listed under `kernels` in `decision-code.json` at the workspace root, whose `proof` names an existing file whose real path is inside the repo.

The rule reports:

- an import of any other relative module, including a `.schema`-suffixed path outside the package's `src/` or one that resolves to a directory;
- an import of any other package;
- a side-effect import of a workspace package;
- a call, alias or destructuring of a workspace binding;
- `import()`, any reference to `require`, `import = require()` and `export … from`.

Type-only imports and an `if (import.meta.vitest)` block are not read. The rule cannot be silenced from inside the file: it reports any inline `oxlint-disable` or `eslint-disable` directive that would silence it. No list exempts existing offenders.

**Breaking:** a repo whose decision files import formatting or other plain modules, import other packages, or call workspace functions now fails lint. To migrate, move presentation into a plain module that the write edge calls, and move decision logic into the decision file or the `*.schema.ts` file of the type it operates on.

`StepError` in `@systemfsoftware/effect-gherkin-spec` keeps the same fields, encoded shape and `message`. It now extends the newly exported `StepFailure`, the schema class whose `message` is the step headline. `StepError` appends the cause summary to it, outside the schema file.

`@systemfsoftware/oxlint-plugin-effect-schema` behaves the same; its workspace and in-source-test helpers moved into the shared kernel.
