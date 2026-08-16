---
"@systemfsoftware/oxlint-plugin-effect-workflow": patch
"@systemfsoftware/oxlint-plugin-cell-vocabulary": patch
---

State the canonical-identifier contract once

Six leaves carried the same rule: a rule matches the canonical identifier only, its suite
carries a near-miss valid case proving the alias does not fire, and widening the match makes
every one of those cases pass vacuously. It now lives once in the hub leaf that governs the
whole family, so a leaf below inherits it rather than restating it.

One clause was genuinely package-specific and stayed: a computed `Effect['fn']` still counts
as an exported `Effect` value under `store-effect-fn-required`, which the shared rule does
not say.

Also corrects the turbo cycle recorded in two places. Both chains from `effect-executor` to
`effect-dmmf` are real — `effect-cell-types` dev-depends on `oxlint-config` directly and
again through `effect-gherkin-spec` — so the two were true at different granularity rather
than in conflict, and both now say so. The closing edge is absent today; the rules exist to
keep it absent.
