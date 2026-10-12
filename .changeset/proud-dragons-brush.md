---
"@systemfsoftware/vitest": minor
---

A registration can pass rerun, a generator body of the registered body's shape, as the body the leak-check second run runs in place of the registered one: it("name", function* ({ expect }) { ... }, { rerun: function* ({ expect }) { ... } }). Without it nothing changes — the registered body runs a second time after a clean first run, outside a shared block. Either way, a failure in the second run is reported as LeakedState.
