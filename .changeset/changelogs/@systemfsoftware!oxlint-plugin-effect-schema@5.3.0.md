## 5.3.0

### Minor Changes

- Two shapes now fail a rule in the recommended set.

  A recursive schema union whose cycle carries six or more separately suspended members derives arbitrary values superlinearly; hoist the cycle to one `Schema.suspend` at the recursion point, where the members reference the union schema directly.

  A recursion point whose suspension returns a union that reaches itself must declare its ceiling with `recursionBudget` in that suspension's annotation, or carry a hand-written derivation of its own. Without either, the derivation stops at the stock ceiling and never generates the deeply nested values the recursion describes.
