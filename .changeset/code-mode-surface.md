---
"@systemfsoftware/effect-contract": minor
---

Add the code-mode surface at `@systemfsoftware/effect-contract/code-mode`. `mount(catalog)` returns the two tools an agent program sees: `search`, which ranks the catalog's capabilities for a query, and `execute`, whose Cell runs the program through the `Sandbox` service and answers an egress denial, a timeout or a thrown program as a refusal. `declarationsOf(catalog)` renders the catalog's JSON Schema documents into one `declare const tools` whose every capability carries a typed input and an answer census documented with its access, egress, refusals and next actions.
