# AGENTS.md — `packages/stryker-js/`

The mutation-testing engine subtree. Owned outright (REPO-O1): we publish and change these packages; the originating `@stryker-mutator` project is history, never governance. Sub-package leaves carry per-package deltas.

## Rules

| ID        | Rule                                                                                                                                                                 | Gate                                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SJ-R1** | Rebuild (`pnpm build`) after any source change in a package consumed via built `dist/` — an unbuilt edit tests the previous version.                                 | `review`                                                                                                                                                       |
| **SJ-R2** | Only `stryker-js-cli/` carries a `stryker.config.json` in this subtree; every other package is an adapter or holds no mutation-enrolled decision — never enroll one. | `git ls-files 'packages/stryker-js/**/stryker.config.json'` returns exactly the `stryker-js-cli/` entry (fixtures excluded); `pnpm check:stryker-mutate-scope` |
