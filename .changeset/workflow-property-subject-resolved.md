---
'@systemfsoftware/oxlint-plugin-test-discipline': major
---

`workflow-property-subject` follows each subject to the file that declares it, instead of matching the import's file name. It traces the subject through scope, a const options variable, imports, package entries (including `exports` patterns) and re-exports.

- **Now passes:** a workflow function imported through its package entry.
- **Now reported:**
  - a schema function re-exported through a `*.workflow.ts` file;
  - a default export, alias or destructured binding the rule cannot trace to a workflow;
  - a local binding that shadows an import;
  - options in a `let` variable or behind a spread.
- **Where it runs:** on any test file in which some property's subject is a workflow, as well as on `*.workflow.property.test.ts` files.
