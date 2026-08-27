## 3.0.0

### Major Changes

- Removed the "./api" and "./inject" subpath exports. The plugin still loads from its main entry; update imports that used the removed subpaths to import from the main entry instead.

### Patch Changes

- Enabled Claude Code plugins now run their command hooks. The hook process sees `CLAUDE_PLUGIN_ROOT` set to that plugin's root. Project settings hooks still run when both match the same event.

- Updated dependencies:
  - @systemfsoftware/effect-cell-types@5.0.0
