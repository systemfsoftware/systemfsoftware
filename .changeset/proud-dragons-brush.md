---
"@systemfsoftware/vitest": minor
---

A registration can pass rerun, a generator body of the registered body's shape, as the body the leak-check second run runs in place of the registered one: it("name", function* ({ expect }) { ... }, { rerun: function* ({ expect }) { ... } }). Without it nothing changes — the registered body runs a second time after a clean first run, outside a shared block — and a failure in either body is still LeakedState.
