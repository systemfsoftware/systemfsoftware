# AGENTS.md — `@systemfsoftware/effect-atom` + `@systemfsoftware/effect-atom-react`

Root `AGENTS.md` governs; this leaf carries only the delta.

## Rules

| ID      | Rule                                                                                                                                                                                                                                                                                                     | Gate                                                                    |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **AT1** | Built by tsdown alone (`build` = `tsdown && pnpm dts:check`); never add api-extractor — per-entry `dtsRollup` cannot express the namespace barrel (`export * as Atom from './Atom.js'` with modules importing their own namespace back from `index.js`) and ships declaration files that do not compile. | `pnpm --filter @systemfsoftware/effect-atom build` + `dts:check` exit 0 |
| **AT2** | `dts:check` (`tsc --noEmit -p tsconfig.dts.json`, `skipLibCheck: false`, `types: ["node"]`) is the only gate that reads the shipped dts; keep it green — a dependency shipping a broken dts turns it red, and that is the point.                                                                         | `pnpm --filter @systemfsoftware/effect-atom dts:check`                  |
| **AT3** | Import type-only members directly (`import { getResult, type Registry } from './Registry'`), never through a namespace import — oxlint's `import/namespace` resolves the runtime `.mjs`, where type-only exports do not exist. Never silence the rule in `oxlint.config.ts`.                             | `pnpm --filter @systemfsoftware/effect-atom lint`                       |
| **AT4** | No mutation gate: neither package carries a `stryker.config.json`; `atom/src/internal/node-lifetime.observer.ts` must never be enrolled in a `mutate` glob (it observes process lifetime — a surviving mutant says nothing about test quality).                                                          | `pnpm check:stryker-mutate-scope`                                       |
| **AT5** | `~effect-atom/atom/…` TypeId literals are wire format, not module paths — `Hydration` payloads are keyed on those strings; renaming the packages must not change them.                                                                                                                                   | `review`                                                                |
| **AT6** | `atom-react` tests run in Vitest browser mode (playwright provider, headless chromium) with `expect.element` — never jsdom, never jest-dom; the environment needs `pnpm exec playwright install chromium`.                                                                                               | `pnpm --filter @systemfsoftware/effect-atom-react test`                 |
| **AT7** | `atom-react/tsconfig.json` keeps `"jsx": "react-jsx"` — Vite derives its esbuild JSX mode from tsconfig; without it every JSX test site fails with `React is not defined`.                                                                                                                               | `pnpm --filter @systemfsoftware/effect-atom-react test`                 |
| **AT8** | Only `src/` is typechecked (`include: ["src"]`); test files are compiled by Vitest, not `tsc`.                                                                                                                                                                                                           | `pnpm --filter @systemfsoftware/effect-atom typecheck`                  |

## Verification

```bash
pnpm --filter @systemfsoftware/effect-atom build && pnpm --filter @systemfsoftware/effect-atom-react build
pnpm --filter @systemfsoftware/effect-atom typecheck && pnpm --filter @systemfsoftware/effect-atom lint && pnpm --filter @systemfsoftware/effect-atom test && pnpm --filter @systemfsoftware/effect-atom attw
pnpm --filter @systemfsoftware/effect-atom-react typecheck && pnpm --filter @systemfsoftware/effect-atom-react lint && pnpm --filter @systemfsoftware/effect-atom-react test && pnpm --filter @systemfsoftware/effect-atom-react attw
```
