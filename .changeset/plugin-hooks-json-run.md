---
"@systemfsoftware/omp-claude-compat": patch
---

Enabled Claude Code plugins now run their command hooks. The hook process sees `CLAUDE_PLUGIN_ROOT` set to that plugin's root. Project settings hooks still run when both match the same event.
