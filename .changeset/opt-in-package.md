---
"@systemfsoftware/opt-in": minor
---

Add `@systemfsoftware/opt-in`: decode a package's opt-ins as owned, argued values with the `OptIn` schema and `optIn`, render them into oxlint overrides and the `@effect/language-service` plugin block with `oxlintOverrides`, `oxlintExcludeFiles`, and `renderEffectPlugin`, and write that block into a package's tsconfig with the `opt-in sync` command; `opt-in sync --check` names the files whose bytes differ and writes nothing.

A `DiagnosticExclusion` is `{ diagnostic, role, files }`, where `files` are tsconfig-relative globs — the same shape an `OxlintExclusion` uses. `renderEffectPlugin` scopes an exclusion to those files: it renders a per-file `overrides` entry that turns the diagnostic `off` only in the files it names, rather than removing the diagnostic from the block, which did not suppress it. Rendered exclusions follow any `overrides` already on the block, and a later override wins for the files it matches.
