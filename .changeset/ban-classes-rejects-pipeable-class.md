---
"@systemfsoftware/oxlint-plugin-cell-architecture": minor
---

`ban-classes` now reports classes that extend `Pipeable.Class`. A pipeable base carries no data contract, so it let an ordinary mutable class pass the rule. Build pipeable values from an object that spreads `Pipeable.Prototype` and a factory function instead. The rule also resolves the base class through namespace imports and call or type-argument wrappers, such as `Context.Service<Self>()('key')` and `Data.Class<Props>`, so sanctioned bases written in those forms are recognized.
