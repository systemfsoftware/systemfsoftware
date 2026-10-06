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

## License

Apache-2.0
