---
"@systemfsoftware/oxlint-plugin-dmmf-workflow": major
"@systemfsoftware/oxlint-config-dmmf": major
"@systemfsoftware/oxlint-config-recommended": major
---

`workflow-match-exhaustive` and `workflow-decides-through-match` judge the `decide` body and every same-file function, record method and class it references, transitively - a referenced helper counts whether it is called or passed as a value. A reached `Match.orElse` over a closed union, an unchanged success and a `_tag`-keyed read are each reported once, however many calls reach them. To migrate, end each reached function's dispatch with `Match.exhaustive`, as in the body.
