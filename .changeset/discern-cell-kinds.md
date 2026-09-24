---
"@systemfsoftware/discern": patch
---

`Discern.Model.model(provider)` starts a model resource: add interceptors with `recording`, `caching`, `replaying`, and `budgeted` as methods or through `pipe`, then read its `layer`. `Discern.Model.layer(provider, interceptors)` and the interceptor factories work as before.
