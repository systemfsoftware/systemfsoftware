---
'@systemfsoftware/stryker-js': minor
'@systemfsoftware/stryker-js-engine': minor
'@systemfsoftware/stryker-js-cli': minor
'@systemfsoftware/stryker-js-typescript-checker': minor
'@systemfsoftware/stryker-js-vitest-runner': minor
'@systemfsoftware/stryker-js-instrumenter': minor
'@systemfsoftware/stryker-js-html-reporter': minor
'@systemfsoftware/stryker-plugins': minor
'@systemfsoftware/arethetypeswrong': minor
'@systemfsoftware/arethetypeswrong-cli': minor
'@systemfsoftware/npm-package': minor
'@systemfsoftware/effect-daemon-spec': minor
---

Schema fields across these packages now state what they accept, and decoding rejects the rest:

- Identifiers, paths, and names decode as non-empty strings; blank values are refused.
- Status fields decode only their enumerated values.
- Text that may legitimately be empty (failure messages, mutant replacement source, file content) is a distinct branded type and can no longer be passed where ordinary text is expected.
- The restart decision input names its two dimensions as literal states (`succeeded`/`failed`, `within`/`exceeded`) instead of booleans.

Constructing these objects from untrusted input now gets validation from decoding; constructing them directly in TypeScript surfaces the values to change as type errors.
