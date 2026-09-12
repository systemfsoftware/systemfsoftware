## 5.3.2

### Patch Changes

- `schema-declaration-location` now judges runtime code only — a file in the package's source directory, or a test file. A module-scope schema in a package-root hook, config, or setup file is outside its subject and no longer reports.
