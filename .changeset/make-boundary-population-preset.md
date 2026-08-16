---
"@systemfsoftware/stryker-js-mutation-run": minor
"@systemfsoftware/effect-daemon-spec": patch
---

The base mutation preset selects at the make boundary.

The preset carries both ignorers (`effect-schema-declarations`, `workflow-make-boundary`) and
`disableBail: true`, so killer recording is structural for every inheriting config. The sandwich
packages (daemon-spec, stryker-js-cli, omp-claude-compat) widen `mutate` to all non-test source
at explicit 100/100/100 thresholds — the ignorer is the selector, so membership is forced by the
brand rather than chosen by a path list. Library packages' mutate arrays are byte-identical.
