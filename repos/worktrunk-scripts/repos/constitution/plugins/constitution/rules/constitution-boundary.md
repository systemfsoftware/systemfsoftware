---
description: "Fires on edits/writes that violate Article II (The Boundary) of the Constitution: decisions inside boundary handlers, eager async promises on public surfaces, unchecked type casts, or pass-through delegation layers."
condition:
  - '(?<![\w$])as\s+(?:any|unknown)(?![\w$])'
  - '(?i)@ts-(?:ignore|expect-error|nocheck)'
  - '(?i)new\s+Promise<\w+>\(\s*\(\s*(?:resolve|reject)'
scope:
  - 'tool:edit(**/*.{ts,tsx,js,jsx,rs,py,go})'
  - 'tool:write(**/*.{ts,tsx,js,jsx,rs,py,go})'
  - 'tool:ast_edit(**/*.{ts,tsx,js,jsx,rs,py,go})'
interruptMode: tool-only
---

# Constitutional Interruption: Article II — The Boundary Violation

You are authoring code that violates **Article II (The Boundary)** of the Supreme Engineering Constitution (`CONSTITUTION-ARTICLES.md`):

1. **Functional Core, Imperative Shell (`CONST-B1`):** Boundary handlers, adapters, and middleware translate external data ↔ domain types.
   - **DO NOT** make domain decisions inside boundary objects. Boundary layers that require complex logic testing belong in the pure core.

2. **Effects Are Lazy Values (`CONST-B2`):** Return side-effects as lazy descriptions (`Effect<A, E>`, IO values), interpreted once at the application edge.
   - **DO NOT** put eager async results (e.g., bare `Promise<T>`) directly on public domain surfaces.

3. **The I/O Sandwich (`CONST-B3` & `CONST-B6`):** Outside interactions follow `read` (impure) → `transform` (pure) → `write` (impure).
   - **DO NOT** interleave I/O inside transformation logic.
   - **DO NOT** add useless pass-through layers that only forward calls without transforming, reading, or writing.

4. **Dependencies Point Inward (`CONST-B4`):** The shell imports the core, never vice versa. Wire all implementations at one composition root.

5. **Decode, Never Cast (`CONST-B5`):** Validate incoming serialized or foreign data into branded domain types with a typed decoder.
   - **DO NOT** use unchecked type casting (`as any`, `as unknown`, `as Type`) or suppression comments (`@ts-ignore`, `@ts-expect-error`) to bypass validation.

Remediate the boundary violation before re-issuing this write.
