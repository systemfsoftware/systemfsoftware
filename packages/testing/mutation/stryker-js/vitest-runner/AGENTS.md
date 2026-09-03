# AGENTS.md — `@systemfsoftware/stryker-js-vitest-runner`

Vitest test-runner plugin for Stryker. Parent: `packages/testing/mutation/stryker-js/AGENTS.md`.

## Rules

| ID | Rule | Gate |
| --- | --- | --- |
| **VR1** | The sandbox directory is the project root: `declarePlugin` unwraps `SandboxDirectory` and `init()` passes it to Vitest as `root` — never `process.cwd()`. Setup file, the project's own Vitest, and `options.vitest.dir` resolve against it. | `review` |
| **VR2** | This adapter currently has no test net: the in-package integration suite was deleted (it could only reach the runner through `src/`, and no surviving suite loads the plugin — the cli integration tests pin `testRunner: 'command'`), so `Runner.ts`, `Runner.schema.ts`, and the hit-limit path in `VitestMutantRun.workflow.ts` have zero coverage. Coverage returns via a published runner entry or decisions behind the published plugin surface — never widen `exports` for a test (KTD3). | `review` |
| **VR3** | `src/stryker-setup.ts` imports nothing local — it is copied into the sandbox alone (as `stryker-setup-<pid>.js`, prepended to each project's setup files); that is why `collectTestName`/`toRawTestId` are duplicated there. | `grep -n "^import" src/stryker-setup.ts` shows no relative imports |
| **VR4** | Source carries no type-suppression comments and no non-null assertions, on the shared no-dom library base with strictness toggles off. | `pnpm --filter @systemfsoftware/stryker-js-vitest-runner typecheck` |

## Verification

```bash
pnpm --filter @systemfsoftware/stryker-js-vitest-runner build
pnpm --filter @systemfsoftware/stryker-js-vitest-runner typecheck
pnpm --filter @systemfsoftware/stryker-js-vitest-runner lint
```
