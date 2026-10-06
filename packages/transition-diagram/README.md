# @systemfsoftware/transition-diagram

Renders the statecharts and workflows a repo already declares — XState v6 machines and
`Workflow.make` decisions — as Mermaid source, SVG and Unicode text, plus a Markdown index, from a
repo-root config. `check` regenerates in memory and fails non-zero on a stale, missing or orphan
artifact, so the committed diagrams cannot drift.

## Installation

```bash
pnpm add @systemfsoftware/transition-diagram
```

## Usage

Add `transition-diagram.config.ts` at the repo root listing the module globs to discover:

```typescript
export default {
  modules: ['./src/**/*.machine.ts', './src/**/*.workflow.ts'],
  outDir: './docs/diagrams',
}
```

Then build the diagrams, or hold CI at zero drift:

```bash
transition-diagram build
transition-diagram check
```

A configured module that exports neither a machine nor a workflow fails with a typed
`UnrecognizedModuleError`. Machines are recognized by XState's machine shape; workflows by the
`@systemfsoftware/effect-cell-types/WorkflowSchemas` symbol `Workflow.make` attaches.

`build` writes `<id>.mmd`, `<id>.svg`, `<id>.txt` and `index.md` under `outDir`. `check` regenerates
the set and reports each stale, missing or orphan file by name; its success line reports the counted
machines, workflows and files.

The renderers are pure and can be used directly:

```typescript
import { machineToMermaid, renderDiscovered, workflowToMermaid } from '@systemfsoftware/transition-diagram'
```

## XState consumers

Machines are read from `xstate` v6 definitions (`setup(...).createMachine(...)`). A consumer that
also drives one with `@xstate/effect` — declaring `fromEffect` actors and starting the machine with
`createEffectActor` inside an Effect program — typechecks, lints and runs with **no repository
override**. There is deliberately no xstate-specific opt-in: the probe that cleared these pins found
no unstable or experimental Effect API, no banned lint rule and no Effect 4.0.1 type incompatibility
on that path, so the role presets and the oxlint presets already admit it as-is. The committed
`tests/__fixtures__/project/machines/stats.machine.ts` is that consumer, discovered and typechecked
by this package's own gates.

The pins are `xstate` 6.0.0-alpha.64 and `@xstate/effect` 0.1.0-alpha.6; path generation for model
tests runs through the `xstate/graph` shortest-path API.

## License

Apache-2.0
