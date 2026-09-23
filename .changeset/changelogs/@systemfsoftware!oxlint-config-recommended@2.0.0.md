## 2.0.0

### Major Changes

- The default export now reports `strict-boolean-expressions`, `missing-pipeable-signature` and `missed-pipeable-opportunity` as errors in source files, tests, type tests and examples, and `strict-effect-provide` as an error in source files. Type tests and examples are now linted with the Effect rules too. Tests, type tests and examples no longer report `node-builtin-import`, because providing a Layer and choosing the runtime's platform are their job. A module whose public API provides a caller's Layer can turn `effecttsgo/strict-effect-provide` off for that file in an `overrides` entry of its own config.
