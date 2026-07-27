# @systemfsoftware/oxlint-plugin-effect-workflow

![version](https://img.shields.io/npm/v/@systemfsoftware/oxlint-plugin-effect-workflow)
![license](https://img.shields.io/npm/l/@systemfsoftware/oxlint-plugin-effect-workflow)

> Enforce the Effect-TS workflow constitution: nine rules that keep pure decision cores pure, every workflow file in the right shape, and illegal states literally unrepresentable.

Effect-TS workflows are the boundary between pure domain decisions and the I/O sandwich that drives them. The rules in this plugin enforce the patterns the [System F Software Constitution](https://github.com/systemfsoftware/constitution) prescribes — a single exported `Effect.fn`, no `async` in the core, no panics reaching consumers, no inline schemas, and property-test scaffolding on every decision.

## Quick start

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-effect-workflow
```

Configure it in your oxlint config:

```ts
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin-effect-workflow'],
  rules: {
    '@systemfsoftware/oxlint-plugin-effect-workflow/workflow-single-function-export': 'error',
    '@systemfsoftware/oxlint-plugin-effect-workflow/workflow-no-effect-import': 'error',
  },
})
```

### Recommended preset (all rules at `error`)

Import the plugin and spread its recommended config:

```ts
import effectWorkflowPlugin from '@systemfsoftware/oxlint-plugin-effect-workflow'
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin-effect-workflow'],
  rules: {
    ...effectWorkflowPlugin.configs.recommended.rules,
  },
})
```

Individual rules can be overridden after the spread — later entries win (standard ESLint merge semantics):

```ts
rules: {
  ...effectWorkflowPlugin.configs.recommended.rules,
  '@systemfsoftware/oxlint-plugin-effect-workflow/workflow-inline-schemas': 'warn',
}
```

## Rules

| Rule                                | Description                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `workflow-inline-schemas`           | Bans inline schemas in workflow files — schemas belong in `.schema.ts` files.      |
| `workflow-no-effect-import`         | Prevents direct `Effect` imports in workflow files — the core stays pure.          |
| `workflow-no-ambient-impurity`      | Bans ambient impurity (side-effecting top-level expressions) in workflow files.    |
| `workflow-no-async`                 | Disallows `async` functions in workflow files — use `Effect.fn` instead.           |
| `workflow-no-unconstructed-variant` | Ensures every tagged union variant is constructed through its branded constructor. |
| `workflow-no-panic-vocabulary`      | Rejects panics (`throw`, `die`, `dieMessage`, etc.) from reaching consumers.       |
| `workflow-property-test-shape`      | Requires every decision/workflow file to have a colocated property-test file.      |
| `workflow-typeid-required`          | Mandates that each workflow file declares a `TypeId` for its action type.          |
| `workflow-single-function-export`   | Enforces exactly one function export per workflow file.                            |

## Tech stack

| Component  | Technology      | Version |
| ---------- | --------------- | ------- |
| Runtime    | Node.js         | 24.x    |
| Linter     | oxlint          | 1.60.x  |
| Plugin API | @oxlint/plugins | 1.60.x  |
| Language   | TypeScript      | 6.0.x   |

## License

MIT
