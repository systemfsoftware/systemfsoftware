---
"@systemfsoftware/stryker-js-engine": patch
"@systemfsoftware/stryker-js-html-reporter": patch
"@systemfsoftware/stryker-js-instrumenter": patch
"@systemfsoftware/stryker-js-typescript-checker": patch
"@systemfsoftware/stryker-js-vitest-runner": patch
---

Each package's published entry point now names its type declarations explicitly, so a type resolver reads them from the manifest rather than inferring the declaration file beside the JavaScript. Exported names, declarations and behaviour are otherwise unchanged.
