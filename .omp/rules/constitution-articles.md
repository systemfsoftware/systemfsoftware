---
description: "Delivers retrieved craft law from CONSTITUTION-ARTICLES.md when editing or writing source code in packages, plugins, omp, or scripts."
condition: ".*"
scope:
  - "tool:edit(packages/**)"
  - "tool:write(packages/**)"
  - "tool:edit(agent-plugins/**)"
  - "tool:write(agent-plugins/**)"
  - "tool:edit(omp/**)"
  - "tool:write(omp/**)"
  - "tool:edit(scripts/**)"
  - "tool:write(scripts/**)"
interruptMode: never
---

# Constitution Articles (Retrieved Craft Law)

You are authoring or editing source code. Consult the craft law in `CONSTITUTION-ARTICLES.md`:

- **Article I — Pure Core:** Domain decisions are pure functions; types before logic; tagged error variants; branded primitives; non-discriminant optionals only for absence.
- **Article II — Boundaries:** Functional core / imperative shell; effect values over runtimes; decode at boundaries.
- **Article III — Verification:** Testing Trophy; property tests for pure decisions; contract tests for boundaries; mutation coverage.
- **Article IV — Organization:** Organize by domain responsibility; clear naming; small cohesion-scoped modules.
