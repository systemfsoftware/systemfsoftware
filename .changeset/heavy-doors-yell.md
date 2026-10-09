---
"@systemfsoftware/oxlint-plugin-cell-architecture": major
---

An `@internal`-tagged export outside a directory segment named `internal` is now reported by `internal-export-jsdoc` as `internalTagOutsideFolder`, so that one rule enforces both directions of the `@internal` invariant. An untagged export inside such a directory is still reported as `missingInternalTag`. The plugin's second `@internal` rule, which used to report `internalTagOutsideFolder`, is removed from the plugin and from its recommended config; a config that still names it must drop that entry.
