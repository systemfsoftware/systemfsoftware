import { renderMermaidASCII, renderMermaidSVG } from 'beautiful-mermaid'
import { Array as Arr, Effect, Order } from 'effect'
import { diagramToMermaid } from './diagram-to-mermaid.js'
import type { DiagramId } from './Diagram.schema.js'
import { DiagramRenderError } from './DiagramError.schema.js'
import type { DiscoveredWorkflow } from './discover.js'
import { detailOf } from './shape.js'
import type { TransitionDiagram } from './TransitionDiagram.schema.js'
import { workflowToDiagram } from './workflow-to-diagram.js'

export interface RenderedDiagram {
  readonly id: DiagramId
  readonly title: string
  readonly mermaid: string
  readonly svg: string
  readonly text: string
}

export interface RenderedSet {
  readonly diagrams: ReadonlyArray<RenderedDiagram>
  readonly files: ReadonlyMap<string, string>
}

const mermaidOf = (diagram: TransitionDiagram): string => `${diagramToMermaid(diagram).join('\n')}\n`

const renderThrown = (
  diagram: string,
  kind: string,
  thunk: () => string,
): Effect.Effect<string, DiagramRenderError> =>
  Effect.try({
    try: thunk,
    catch: (cause) => DiagramRenderError.make({ diagram: `${diagram}.${kind}`, detail: detailOf(cause) }),
  })

export const renderDiagram = (diagram: TransitionDiagram): Effect.Effect<RenderedDiagram, DiagramRenderError> =>
  Effect.gen(function*() {
    const mermaid = mermaidOf(diagram)
    const svg = yield* renderThrown(diagram.id, 'svg', () => renderMermaidSVG(mermaid))
    const text = yield* renderThrown(diagram.id, 'txt', () => renderMermaidASCII(mermaid, { colorMode: 'none' }))
    return { id: diagram.id, title: diagram.title, mermaid, svg, text }
  })

const artifactEntriesOf = (diagram: RenderedDiagram): ReadonlyArray<readonly [string, string]> => [
  [`${diagram.id}.mmd`, diagram.mermaid],
  [`${diagram.id}.svg`, diagram.svg],
  [`${diagram.id}.txt`, diagram.text],
]

const indexOf = (diagrams: ReadonlyArray<RenderedDiagram>): string =>
  ['# Transition Diagrams', '', ...Arr.map(diagrams, (diagram) => `- [${diagram.title}](./${diagram.id}.mmd)`), '']
    .join('\n')

const filesOf = (diagrams: ReadonlyArray<RenderedDiagram>): ReadonlyMap<string, string> => {
  const entries: ReadonlyArray<readonly [string, string]> = [
    ...Arr.flatMap(diagrams, artifactEntriesOf),
    ['index.md', indexOf(diagrams)],
  ]
  return new Map(entries)
}

const diagramOf = (discovered: DiscoveredWorkflow): TransitionDiagram =>
  workflowToDiagram({ id: discovered.id, title: discovered.title, schemas: discovered.schemas })

export const renderDiscovered = (
  discovered: ReadonlyArray<DiscoveredWorkflow>,
): Effect.Effect<RenderedSet, DiagramRenderError> =>
  Effect.gen(function*() {
    const sorted = Arr.sortWith(discovered, (item) => item.id, Order.String)
    const diagrams = yield* Effect.forEach(sorted, (item) => renderDiagram(diagramOf(item)), { concurrency: 1 })
    return { diagrams, files: filesOf(diagrams) }
  })
