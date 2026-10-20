---
"@systemfsoftware/oxlint-plugin-effect-schema": patch
---

`schema-file-imports-pure-modules-only` now lets a schema file value-import any package of the pnpm workspace that encloses it, as the rule documented. Before, only `@systemfsoftware/*` names were admitted, so a workspace with its own scope had every cross-package schema import refused. The rule finds the workspace by walking up from the linted file and lists its projects with pnpm's own readers (`@pnpm/workspace.root-finder`, `@pnpm/workspace.workspace-manifest-reader`, `@pnpm/workspace.projects-reader`), so the admitted set is the one the workspace manifest's `packages` patterns select: a negated pattern excludes, the root project counts, and a file outside any workspace admits none. A non-pure third-party package is still refused. Those three packages and their peer `@pnpm/logger` are new runtime dependencies of the plugin.
