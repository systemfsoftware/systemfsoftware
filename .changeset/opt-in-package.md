---
"@systemfsoftware/opt-in": minor
---

Add `@systemfsoftware/opt-in`: decode a package's opt-ins as owned, argued values with the `OptIn` schema and `optIn`, render them into oxlint overrides and the `@effect/language-service` plugin block with `oxlintOverrides`, `oxlintExcludeFiles`, and `renderEffectPlugin`, and write that block into a package's tsconfig with the `opt-in sync` command; `opt-in sync --check` names the files whose bytes differ and writes nothing.
