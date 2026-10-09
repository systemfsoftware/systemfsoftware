---
"@systemfsoftware/gritlint": minor
---

Add the `cell-architecture` pack. Its `service-exports-no-layer` rule reports a service module that makes a `Layer.*` call, declares a class field named `layer` or `*Layer`, or exports a `*Live` name. Enable it with `"packs": { "cell-architecture": {} }`.
