---
"@systemfsoftware/effect-readiness": major
"@systemfsoftware/effect-microsandbox": none
---

`Readiness.NodeHostProber` is now the Node driver module rather than a bound layer value. Bind it with `Readiness.NodeHostProber.layer`: `Layer.merge(Readiness.NodeHostProber.layer, logLayer)`.
