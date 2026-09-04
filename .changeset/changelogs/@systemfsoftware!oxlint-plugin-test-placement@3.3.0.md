## 3.3.0

### Minor Changes

- The `tests-import-public-api` rule now applies to every file under a package's `tests` or `__tests__` folder — helpers, fixtures, and type tests included — instead of only files whose name ends in `.test` or `.spec`. Any file in those folders that imports the package's own source may start failing lint on upgrade: import the published entry point instead, or remove the test.
