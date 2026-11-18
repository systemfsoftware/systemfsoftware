---
'@systemfsoftware/oxlint-plugin-test-discipline': major
---

Add `workflow-property-subject`, on in the recommended config. Every `it.prop` subject in a workflow property must be declared in a `*.workflow.ts` module. The rule follows the subject through scope, an options variable, imports, package entries and re-exports to the file that declares it. A workflow function imported through its package entry passes. The rule reports:

- a subject declared in the test file, such as a helper, an alias, an inline function, a call, or a local binding that shadows an import;
- a subject declared in any other module, even one re-exported through a `*.workflow.ts` file;
- options that hide the subject behind a spread or a computed key.

The rule applies to `*.workflow.property.test.ts` files, and to any test file in which some property's subject is a workflow.
