---
'@systemfsoftware/oxlint-plugin-test-discipline': major
---

Add `workflow-property-subject`, on in the recommended config. In a `*.workflow.property.test.ts`, every `it.prop` subject must be a binding imported from a `*.workflow.ts` or `*.workflow.js` module. The rule reports a subject declared in the test file, such as a helper, an inline function or a call. It also reports a subject imported from any other module, including a package entry or a schema module.
