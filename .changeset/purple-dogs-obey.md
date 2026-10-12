---
"@systemfsoftware/oxlint-plugin-dmmf-workflow": major
"@systemfsoftware/oxlint-config-dmmf": major
"@systemfsoftware/oxlint-config-recommended": major
---

`workflow-match-exhaustive` and `workflow-decides-through-match` judge every same-file function a decide body reaches through calls, not only the body. A helper's `Match.orElse` over a closed union, its unchanged success and its `_tag`-keyed read are each reported once, however many calls reach it. To migrate, end each helper's dispatch with `Match.exhaustive`, as in the body.
