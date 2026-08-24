## 2.2.0

### Minor Changes

- Plugins are discovered under this scope by default. The `plugins` option now
  defaults to a glob over this scope instead of the original project's, so a
  configuration that relied on the previous default while installing plugins from
  the original project must now list those plugins explicitly. Discovery also no
  longer fails when no matching scope directory is installed: it loads nothing and
  warns.

  The report's dependency section names the packages of this scope, and the
  report's home link points at this project.
