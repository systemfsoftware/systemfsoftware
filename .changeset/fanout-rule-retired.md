---
"@systemfsoftware/oxlint-plugin-property-testing": major
"@systemfsoftware/oxlint-plugin-effect-dmmf": major
---

The no-unbounded-fanout rule is removed from the property-testing preset and from the dmmf aggregate preset. Configs that enable it by name stop resolving it; delete the entry. Collection generation was already bounded by the generator's default size cap and by runtime budgets, so the rule enforced nothing.
