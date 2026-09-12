## 2.1.1

### Patch Changes

- Releases the workspace so its published versions track the shared dependency graph this change moves.

- The `@systemfsoftware/source` export condition is gone. It resolved to a package's TypeScript sources for editors and in-repo typechecks; each package now exports only its built entry. If your tsconfig sets `customConditions: ["@systemfsoftware/source"]`, or a bundler config names that condition, remove it — resolution falls back to the built entry, which is what every consumer already got.

- Updated dependencies:
  - @systemfsoftware/effect-schema-law@2.1.1
  - @systemfsoftware/effect-schema-recursion-budget@0.0.1
