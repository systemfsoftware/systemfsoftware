---
description: "Fires on edits/writes that violate Article I (The Pure Core) of the Constitution: impure decisions doing I/O or throwing, unvalidated primitives in domain models, unbranched boolean/string error distinctions, or procedural control flow."
condition:
  - '(?i)throw\s+new\s+Error\('
  - '(?i)(?:class|interface)\s+\w+\s*\{[^}]*?\b(?:success|isError)\s*:\s*\b(?:true|false|boolean\b)'
  - '(?i)type\s+\w+\s*=\s*\{[^}]*?\b(?:success|isError)\s*:\s*\b(?:true|false|boolean\b)'
scope:
  - 'tool:edit(**/*.{ts,tsx,js,jsx,rs,py,go})'
  - 'tool:write(**/*.{ts,tsx,js,jsx,rs,py,go})'
  - 'tool:ast_edit(**/*.{ts,tsx,js,jsx,rs,py,go})'
interruptMode: tool-only
---

# Constitutional Interruption: Article I — The Pure Core Violation

You are authoring code that violates **Article I (The Pure Core)** of the Supreme Engineering Constitution (`CONSTITUTION-ARTICLES.md`):

1. **Pure Decisions (`CONST-P1`):** Every domain decision must be a pure function (data in, value or typed error out).
   - **DO NOT** perform I/O, read system clocks, use randomness, or `throw` exceptions inside decision logic.
   - Return errors as typed values.

2. **Types Before Logic (`CONST-D1` & `CONST-D4`):** Make illegal states unrepresentable.
   - **DO NOT** encode states by field presence (e.g. `Order { status, shippedAt?, trackingId? }`). Model mutually exclusive states as a tagged union.
   - **DO NOT** use unchecked casts (`as any`, `as unknown`).

3. **Distinct Tagged Errors (`CONST-D2`):** Give every failure its own tagged variant.
   - **DO NOT** distinguish errors by a `success: boolean` flag or `message: string`. Callers must branch exhaustively on the variant tag.

4. **No Primitive Obsession (`CONST-D3`):** Brand domain-significant numbers, IDs, and codes.

5. **Single-Path Core (`CONST-P2`):** Pure decisions are expressions, not procedures (cyclomatic complexity = 1). Use exhaustive pattern matching / fold / map rather than procedural `if/else`, loops, or `switch` statements in pure decision modules.

Remediate the violation before re-issuing this write.
