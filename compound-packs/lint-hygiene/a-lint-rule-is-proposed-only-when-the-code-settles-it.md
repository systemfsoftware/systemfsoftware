---
title: A lint rule is proposed only when the code settles it
applies_when:
  - proposing a lint rule in a plan, a review finding or a learning
  - reviewing a change that adds, configures or removes a lint rule
  - deciding whether a change needs a lint rule to prevent a mistake
  - capturing a learning whose Prevention section proposes one
tags: [lint, rules, review, prevention]
---

A lint rule encodes a decision the code settles once: every occurrence it reports is wrong in every case it can reach. It never bans a practice merely because some uses are wrong; a decision that needs case-by-case judgment is review's, never lint.

A type that makes the bad state unconstructable comes first. A rule may close a hole the compiler leaves open in such a type, and it reports only that hole: the bypass is named from the code, and the definition that owns the invariant is not a bypass.

One occurrence earns a fix, not a rule.

No escape hatch: nothing an author can write or configure whose only effect is to silence the rule on their own code. A rule that needs one is a judgement.

A rule never selects what it applies to by a file's name or location.

A rule is on at error over a clean tree, or it is off.

Adding, weakening or removing a rule is the owner's call, and it lands apart from the work it grades.

Write "add a lint rule to prevent this" in a plan, a review finding or a learning only when the points above hold.

WRONG: "Ban every config value that lacks a comment justifying it; keep an allowlist for the entries that cannot comply."

RIGHT: "A hand-built object skips the constructor's validation: report that literal at error, fix every site first, and land the rule in its own change."
