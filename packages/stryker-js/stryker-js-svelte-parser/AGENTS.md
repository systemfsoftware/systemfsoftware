# AGENTS.md — `@systemfsoftware/stryker-js-svelte-parser`

The svelte format plugin: one Parser contribution, `.svelte` only. Root `AGENTS.md` governs; `packages/stryker-js/AGENTS.md` carries this subtree's rules.

## Rules

| ID       | Rule                                                                                                                                                                                  | Gate                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **SVP1** | The svelte compiler and the template walker resolve from the project's own install at run time; this package declares neither, in any dependency field.                               | `pnpm --filter @systemfsoftware/stryker-js-svelte-parser test` |
| **SVP2** | A compiler that cannot be resolved, one older than 3.30, or a module without a `walk` export comes back as a named failure value — `parse` never throws across the factory boundary.  | `pnpm --filter @systemfsoftware/stryker-js-svelte-parser test` |
| **SVP3** | `parse` returns plain data — range, format, content, isExpression, offset. Wrong: returning a compiler node or a parsed AST. Right: the host parses `content`.                        | review                                                         |
| **SVP4** | The published surface is effect-free and carries no other format's code. Wrong: importing `effect` in `src/`, or a second format's parser here. Right: plain TypeScript, svelte only. | review                                                         |
| **SVP5** | `.svelte` is the only extension and `svelte` the only contribution name.                                                                                                              | `pnpm --filter @systemfsoftware/stryker-js-svelte-parser test` |

## Verification

```bash
pnpm --filter @systemfsoftware/stryker-js-svelte-parser typecheck
pnpm --filter @systemfsoftware/stryker-js-svelte-parser test
pnpm --filter @systemfsoftware/stryker-js-svelte-parser lint
```
