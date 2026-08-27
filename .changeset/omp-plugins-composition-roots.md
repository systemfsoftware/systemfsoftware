---
"@systemfsoftware/omp-claude-compat": major
"@systemfsoftware/omp-agent-discipline": major
---

Removed the `/api` and `/inject` subpath exports. These packages are now composition roots whose only entry is the extension the host loads; the capabilities they previously exposed live in their own packages: `@systemfsoftware/claude-settings`, `@systemfsoftware/claude-hooks`, `@systemfsoftware/claude-inject`, and `@systemfsoftware/agent-discipline`. Import those instead.
