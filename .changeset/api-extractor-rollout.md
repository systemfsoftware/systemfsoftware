---
"@systemfsoftware/npm-package": patch
"@systemfsoftware/storybook-gherkin": patch
"@systemfsoftware/effect-atom": none
"@systemfsoftware/effect-atom-react": none
---

Type declarations for `@systemfsoftware/npm-package` and `@systemfsoftware/storybook-gherkin` are now flattened: every exported type is declared inline, so no published type refers to a declaration file you would have to resolve yourself.

The declarations of `@systemfsoftware/effect-atom` and `@systemfsoftware/effect-atom-react` are unchanged.
