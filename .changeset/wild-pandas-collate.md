---
"@systemfsoftware/omp-claude-compat": major
---

The coverage schemas HookCoverageSchema and HookCoverageRowSchema are no longer exported; declare the shape locally if you imported them. SettingsSource is now the schema-derived source type, so the optional pluginRoot field is typed string | undefined.
