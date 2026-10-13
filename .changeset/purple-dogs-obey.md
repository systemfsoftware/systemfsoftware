---
"@systemfsoftware/oxlint-plugin-dmmf-workflow": major
"@systemfsoftware/oxlint-config-dmmf": major
"@systemfsoftware/oxlint-config-recommended": major
---

`workflow-match-exhaustive` and `workflow-decides-through-match` judge the `decide` body, every same-file function and class it references transitively - called or passed as a value - and every record method it calls, directly or through a module-scope `const` alias. A reached `Match.orElse` over a closed union, an unchanged success and a `_tag`-keyed read are each reported once, however many calls reach them. To migrate, end each reached function's dispatch with `Match.exhaustive`, as in the body.
