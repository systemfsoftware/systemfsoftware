---
description: "Fires during review or implementation when constitutional rules are treated as optional, bypassed without declared CONST-W3 justification, or downgraded from P0 severity."
condition:
  - '(?i)(?:downgrade|waive|ignore|skip)\s+(?:the\s+)?constitution'
  - '(?ims)severity\s*:\s*(?:P1|P2|P3|advisory)\b.{0,200}?\bCONST-[A-Z][0-9]+\b'
  - '(?ims)\bCONST-[A-Z][0-9]+\b.{0,200}?\bseverity\s*:\s*(?:P1|P2|P3|advisory)\b'
scope:
  - 'tool:edit(**/*)'
  - 'tool:write(**/*)'
  - 'tool:ast_edit(**/*)'
interruptMode: tool-only
---

# Constitutional Interruption: Constitutional Review & Conduct Violation

You are attempting to waive, downgrade, or silently bypass the Supreme Engineering Constitution (`CONSTITUTION.md`):

1. **Automatic P0 Severity on All Violations (`CONST-G3`):**
   - Every undeclared violation of the constitution during review is an **automatic, non-negotiable P0 failure**.
   - **ZERO APPEALS, NO SEVERITY DOWNGRADES, NO WAIVERS.**
   - **DO NOT** downgrade a constitutional violation to an advisory, P1, P2, or non-blocking finding.
   - **DO NOT** approve or merge any change while an undeclared constitutional violation exists.

2. **No Silent Bypass (`CONST-W3`):**
   - The **ONLY** legal exception to any rule is an explicit, declared bypass stated in the open, in the change itself, naming the exact rule ID and the specific reason why it was wrong or impossible for this case.
   - Undeclared breaches cannot be waived by reviewer discretion.

3. **Depth Over Expedience (`CONST-S1`):**
   - Fix the root cause. Restructure when the design is wrong. Do not patch symptoms to ship faster.

4. **Subtract Before You Add (`CONST-S4`):**
   - Treat every line as a liability. Delete dead branches and replace complex records with unconstructable tagged unions before adding new abstractions.

5. **First Principles Over Precedent (`CONST-S2`):**
   - Neighboring code is evidence of what exists, never of what is correct. Justify all patterns by first principles.

Block the change or declare the bypass explicitly under `CONST-W3`.
