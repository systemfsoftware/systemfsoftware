---
title: A lint rule enforces a decision; it never makes one
applies_when:
  - proposing a lint rule in a plan, a review finding or a learning
  - reviewing a change that adds, configures or removes a lint rule
  - deciding whether a change needs a lint rule to prevent a mistake
  - capturing a learning whose Prevention section proposes one
tags: [lint, rules, review, prevention]
---

A lint rule enforces a decision that is already made and recorded: this construct is never right here. It never makes that decision. When the answer depends on the case, or nobody has decided, the question is review's; a blanket ban on a practice that is sometimes right is refused.

A type that makes the bad state unconstructable comes first. A rule may close a hole the compiler leaves open in such a type, and it reports only that hole: the bypass is named from the code, and the definition that owns the invariant is not a bypass.

One occurrence earns a fix, not a rule.

No escape hatch: nothing an author can write or configure whose only effect is to silence the rule on their own code. A rule that needs one is a judgement.

A rule never selects what it applies to by a file's name or location.

A rule is on at error over a clean tree, or it is off.

Adding, weakening or removing a rule is the owner's call, and it lands apart from the work it grades.

Write "add a lint rule to prevent this" in a plan, a review finding or a learning only when the points above hold.

WRONG: "Some uses of this pattern are mistakes, so ban the pattern and keep an allowlist for the uses that are fine."

RIGHT: "The team decided this module is never imported from that layer, and it keeps happening: forbid the import at error, fix every site first, and land the rule in its own change."
