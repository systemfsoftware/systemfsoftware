---
"@systemfsoftware/effect-acl": patch
---

acl-single-transform-export now recognises schema declarations built with `.pipe()` chains. `isSchemaDeclaration` matched only bare `S.X` member access, so `S.String.pipe(S.filter(...))` — a schema declaration the rule's own contract permits — was falsely reported as `disallowedExport`. The predicate now walks S-rooted member chains, and a regression case pins the behaviour.
