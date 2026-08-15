---
"@systemfsoftware/oxlint-plugin-effect-executor": major
---

Remove `executor-requires-deps-tag`

The rule mandated that every `*.executor.ts` declare a `*Deps` `Context.Tag` and acquire
every service through it. Its own message named the two defects: it called requiring a real
port directly "an executor acquiring services it does not own", and it offered "or rename the
file to the cell it actually is" as the escape.

Requiring a port directly is dependency rejection's preferred form, and the governing text
(Wlaschin's six approaches) licenses a requirement only where the dependency is impure AND has
a second implementation or a test substitute. The rule quantified over every executor instead,
so it shipped a universal mandate no primary supports — and because it was published, that
mandate reached every consumer who installed the plugin.

The rule, its config, its fixtures and its `recommended` entry are deleted. The remaining
rules in this plugin are unchanged.
