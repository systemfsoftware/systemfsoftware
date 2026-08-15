---
'@systemfsoftware/effect-cell-types': minor
---

Add the Wire alphabet: a declaration is built from members this workspace mints, so a foreign type
named in a wire declaration is a compile error at the authoring site rather than a lint finding
somewhere else. Marking sits on the schema, not the decoded value, and every combinator takes marked
inputs and returns marked outputs, so a workspace-local alias of a vendor type confers no mark and is
refused too. Deliberately minting a foreign schema still compiles; that residual is pinned by a type
test and belongs to a declaration-site checker.
