---
"@systemfsoftware/effect-cell-types": none
---

Package lint scripts now select oxlint's `agent` output format when `AGENT` is set, keep `default` for human runs, and still yield to an explicit `OXLINT_FORMAT`. `AGENT` joins the turbo lint cache env so the branch is live. Dev-tooling surface only, no shipped behaviour.
