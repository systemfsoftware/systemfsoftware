## 3.0.0

### Major Changes

- Removed the "./api" subpath export. The plugin still loads from its main entry; update imports that used the removed subpath to import from the main entry instead.

### Patch Changes

- Updated dependencies:
  - @systemfsoftware/effect-cell-types@5.0.0
