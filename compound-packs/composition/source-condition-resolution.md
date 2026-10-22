---
title: Workspace packages resolve to source through a custom export condition, so development and tests need neither a build nor a deep import
applies_when:
  - a package imports another workspace package during development or tests
  - configuring tsconfig paths, Vite aliases or test resolution for workspace packages
  - a test fails because a sibling package isn't built
tags: [composition, resolution, export-conditions, dev-loop]
---

Each library's exports map has a custom condition (for example `"source"`) that points at its TypeScript source, ahead of the built output. TypeScript (`customConditions`), Vite and the test runner enable that condition in the workspace. Packages import each other by their public specifiers and still get source without a build.

This removes the two usual workarounds: path aliases that bypass the exports map, and deep `src/` imports. Vitest wires `__vitest_source__` through tsconfig `customConditions` and its bundler for exactly this.

Gate (fact-gated): `repo-checks composition-imports` fails a tsconfig `paths` entry (read from the parsed compiler options) or a bundler `alias` (read from the syntax tree of the vite, vitest or astro config) that points into another package's source, and any import that resolves into another package by path or by an `exports` subpath the package does not admit.
