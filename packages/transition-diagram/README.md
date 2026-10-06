# @systemfsoftware/transition-diagram

Renders the `Workflow.make` decisions a repo already declares as Mermaid source, SVG and Unicode text,
plus a Markdown index, from a repo-root config. `check` regenerates in memory and fails non-zero on a
stale, missing or orphan artifact, so the committed diagrams cannot drift.

## Installation

```bash
pnpm add @systemfsoftware/transition-diagram
```

## Usage

Add `transition-diagram.config.ts` at the repo root listing the module globs to discover:

```typescript
export default {
  modules: ['./src/**/*.workflow.ts'],
  outDir: './docs/diagrams',
}
```

Then build the diagrams, or hold CI at zero drift:

```bash
transition-diagram build
transition-diagram check
```

A configured module that exports no workflow fails with a typed `UnrecognizedModuleError`; a workflow is
recognized by the `@systemfsoftware/effect-cell-types/WorkflowSchemas` symbol `Workflow.make` attaches.

`build` writes `<id>.mmd`, `<id>.svg`, `<id>.txt` and `index.md` under `outDir`. `check` regenerates the
set and reports each stale, missing or orphan file by name; its success line reports the counted
workflows and files.

## The diagram schema

The package owns the type it renders, so an adapter for another source of diagrams builds on this
schema rather than on this package's discovery:

| Export              | What it is                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `TransitionDiagram` | `{ id, title, states, transitions }`                                                                                     |
| `DiagramState`      | a state: `{ id, label, kind }`                                                                                           |
| `DiagramNodeKind`   | `initial`, `decision`, `outcome`, `error`, `final`                                                                       |
| `DiagramTransition` | an edge: `{ from, to, event?, guard?, kind }`                                                                            |
| `DiagramEdgeKind`   | `normal` (solid), `error` (dashed)                                                                                       |
| `StateId`           | a branded, Mermaid-safe state identifier                                                                                 |
| `DiagramId`         | a branded diagram identifier; it names the artifacts                                                                     |
| `DiagramDefect`     | `DiagramShapeInvalid`, `DuplicateStateId`, `DanglingTransitionSource`, `DanglingTransitionTarget`, `MissingInitialState` |

`decodeTransitionDiagram(input)` turns unknown data into a `TransitionDiagram` or a list of typed
defects: a transition to an undeclared state, a duplicated state id, a missing `initial` state and an
unreadable shape are each their own variant. `diagramToMermaid(diagram)` returns the Mermaid lines.
`renderDiagram(diagram)` is an Effect producing the Mermaid source, the SVG and the Unicode text.

```typescript
import { decodeTransitionDiagram, diagramToMermaid, renderDiagram } from '@systemfsoftware/transition-diagram'
import { Effect, Result } from 'effect'

const diagram = Result.getOrThrow(decodeTransitionDiagram(raw))
const lines = diagramToMermaid(diagram)
const rendered = yield* renderDiagram(diagram)
```

## License

Apache-2.0
