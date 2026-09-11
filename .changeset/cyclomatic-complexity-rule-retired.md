---
'@systemfsoftware/oxlint-plugin': major
---

The `no-domain-branching-density` rule is removed. It is gone from the plugin's recommended set, so a project that extends the recommended configuration needs no change; a project that names the rule directly must delete that configuration entry, because an id no rule answers to is reported as unknown and enforces nothing.

Per-function cyclomatic complexity is now measured by the linter's built-in `complexity` rule. The complete preset configures it; a project adopting the plugin alone does not get it.
