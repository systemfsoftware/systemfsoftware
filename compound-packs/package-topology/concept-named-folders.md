---
title: A package, family folder or folder is named for the one concept it owns
applies_when:
  - adding a package, a family folder, or a folder at any depth, `src/` subfolders included
  - renaming or moving a package or a folder
  - adding a file inside a folder whose own name, or a part of it, is `core`, `shell`, `util`/`utils`, `service`/`services`, `manager`/`managers`, `helper`/`helpers`, `common`, `shared`, `misc`, `lib`/`libs`, `adapter`/`adapters`, `di`, `fs` or `impl`
tags: [package-topology, naming, folders, packages, layout]
---

A package, family folder or first-party folder is named for the one concept it owns, never for a role, layer or mechanism. CONST-N1 asks that every name answer "of what?" (`CONSTITUTION.md:43-48`). A role word answers "what kind of code", so every new file fits under it, and a reader cannot predict what is inside or where a new file goes. A role-word folder is undone by a restructure. In this repository, packages sat in role tiers (`packages/core/effect/*`, `packages/lint`, `packages/testing`) until #357 (`02c393fcf4`) moved them, touching 1,339 files, and `@systemfsoftware/arethetypeswrong-core` was split into packages named for their capabilities by #241 (`3d6aa9f9e1`).

The rule covers what a change adds, renames or moves: a package, a family folder, or a folder at any depth. Vendored `repos/*`, `node_modules`, `dist` and test roots (`__tests__`, `test`, `tests`, `__mocks__`, `fixtures`, `__fixtures__`, `testResources`) are outside it; a test helper is reached from the test that imports it, not by navigating the product tree. File names are outside it too.

1. **These words fail on sight:** `core`, `shell`, `util`/`utils`, `service`/`services`, `manager`/`managers`, `helper`/`helpers`, `common`, `shared`, `misc`, `lib`/`libs`, `adapter`/`adapters`, `di`, `fs`, `impl`. A word matches the folder's own name or the package's unscoped name, or any part of it split on `-`, `_`, `.` or a lower-to-upper case change, in any case: `Shared-UI`, `__utils__`, `trace-shared` and `AppShell` fail, and `microsandbox` and `Kernel` hold because each is one word. A folder is judged by its own name; an ancestor is judged when it is itself added, renamed or moved.
2. **Any other name fails when the contents share no concept it states.** A word off the list is not a pass; `kernel`, `internal`, `base`, `tools` and `sandbox` stay off because each names a concept in this organisation.
3. **Layers are prose.** CONST-B1 and CONST-B4 name a functional core and an imperative shell, and that split lives in modules, not folders: an adapter module sits flat beside its service module (`cell-architecture/service-and-layer-boundaries.md`). A folder is named for the concept both regimes serve (`pricing/`, `checkout/`), never `core/` and `shell/`.
4. **An existing folder named by a listed word is renamed before it grows.** A change that adds a file inside one renames that folder first, in the same change or a lower stacked layer. Existing occurrences are findings for rename pull requests, never an allowlist.

```text
# WRONG: one folder per role, so every capability lands in it
core/
  daemon/  cli/  sdk/  codegen/  e2e/
ui/
  shell/   # Vite entry, providers, frame, root routes, conversation UI

# RIGHT: one folder per concept a reader can check
daemon/
cli/
sdk/
codegen/
ui/
  app-frame/      # Vite entry, providers, frame, root routes
  conversation/
```

Where a package lives, and when a family folder exists, is placement law in root `AGENTS.md` REPO-S5.

Gate: `review`. Does the diff add, rename or move a package, family folder or folder whose own name, or a part of it split on `-`, `_`, `.` or a case change, is a listed word, or add a file inside such a folder without renaming it? For any other added name, do the folder's contents share the one concept the name states?
