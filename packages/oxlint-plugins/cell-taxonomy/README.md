# @systemfsoftware/oxlint-plugin-cell-taxonomy

An oxlint plugin enforcing the cell taxonomy: every source file under `src/`
names the job it does — `<name>.<cell>.ts` — or carries one of a small set of
exempt entrypoint names.

Constitution IV.2 bans "a suffix no rule keys on". This is the rule that keys
on it.

## Install

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-cell-taxonomy
```

```ts
import cellTaxonomy from '@systemfsoftware/oxlint-plugin-cell-taxonomy'
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin-cell-taxonomy'],
  rules: { ...cellTaxonomy.configs.recommended.rules },
})
```

It also ships inside
[`@systemfsoftware/oxlint-plugin-effect-dmmf`](../effect-dmmf/README.md) — if
you already register that, you have this rule.

## Rules

| Rule                   | What it enforces                                                               |
| ---------------------- | ------------------------------------------------------------------------------ |
| `cell-suffix-required` | A source file under `src/` is `<name>.<cell>.ts` or an exempt entrypoint name. |

### Sanctioned cells

Thirteen by default — the six pure-core cells, the five shell cells, and the
two domain-blind ones:

| Cell             | Job                                                       | Purity |
| ---------------- | --------------------------------------------------------- | ------ |
| `.schema.ts`     | branded types, tagged unions, test generators             | pure   |
| `.workflow.ts`   | one business decision: command → decision-or-typed-error  | pure   |
| `.acl.ts`        | decode a foreign shape into local vocabulary              | pure   |
| `.shape.ts`      | another system's declarations (DB row, wire DTO)          | pure   |
| `.adapter.ts`    | wraps one concrete driver behind a port                   | pure   |
| `.policy.ts`     | domain-blind effect governor (retry, rate-limit, timeout) | impure |
| `.executor.ts`   | the I/O sandwich for one operation                        | impure |
| `.store.ts`      | fetch/persist this capability's data                      | impure |
| `.handler.ts`    | transport terminus                                        | impure |
| `.middleware.ts` | composable transport edge                                 | impure |
| `.state.ts`      | escaping live/reactive state                              | impure |
| `.kernel.ts`     | domain-blind pure behaviour, no vocabulary at all         | pure   |
| `.observer.ts`   | pure behaviour in operational vocabulary                  | pure   |

### Exempt names

`index.ts`, `main.ts`, `mod.ts` — a capability's public barrel and a process
composition root are not cells, so they carry no cell suffix.

### What it never reports

- Anything outside a `src/` directory.
- `.tsx` — a component is named by PascalCase, a different axis.
- `.d.ts` ambient declarations.
- `*.test.ts` / `*.spec.ts`, and anything under `tests/` or `__tests__/`.
  Test filenames belong to
  [`test-placement`](../test-placement/README.md), their sole owner.

A bare `workflow.ts` **is** reported: it names a cell but no capability, and
the taxonomy is `<name>.<cell>.ts`.

## Options

Both lists are defaults, not a closed world. A project's sanctioned names are
project-relative, so the rule takes them as options:

```ts
rules: {
  '@systemfsoftware/oxlint-plugin-cell-taxonomy/cell-suffix-required': ['error', {
    cells: ['workflow', 'schema', 'config'],
    exempt: ['index.ts', 'server.ts'],
  }],
}
```

| Option   | Type       | Default                         |
| -------- | ---------- | ------------------------------- |
| `cells`  | `string[]` | the thirteen above              |
| `exempt` | `string[]` | `index.ts`, `main.ts`, `mod.ts` |

Each key overrides independently — supplying only `exempt` keeps the default
`cells`, and vice versa.

## Development

| Check    | Command                                                                |
| -------- | ---------------------------------------------------------------------- |
| Types    | `pnpm --filter @systemfsoftware/oxlint-plugin-cell-taxonomy typecheck` |
| Test     | `pnpm --filter @systemfsoftware/oxlint-plugin-cell-taxonomy test`      |
| Mutation | `pnpm --filter @systemfsoftware/oxlint-plugin-cell-taxonomy mutation`  |
