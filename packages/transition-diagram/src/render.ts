import { renderMermaidASCII, renderMermaidSVG } from 'beautiful-mermaid'
import { Array as Arr, Effect, Order } from 'effect'
import type { DiagramId, DiagramKind } from './Diagram.schema.js'
import { DiagramRenderError } from './DiagramError.schema.js'
import type { Discovered } from './discover.js'
import { machineToMermaid } from './machine-to-mermaid.js'
import { detailOf } from './shape.js'
import { workflowToMermaid } from './workflow-to-mermaid.js'

export interface RenderedDiagram {
  readonly id: DiagramId
  readonly kind: DiagramKind
  readonly title: string
  readonly mermaid: string
  readonly svg: string
  readonly text: string
}

export interface RenderedSet {
  readonly diagrams: ReadonlyArray<RenderedDiagram>
  readonly files: ReadonlyMap<string, string>
}

const mermaidLinesOf = (discovered: Discovered): ReadonlyArray<string> =>
  discovered.kind === 'machine'
    ? machineToMermaid(discovered.machine)
    : workflowToMermaid({ title: discovered.title, schemas: discovered.schemas })

const renderThrown = (
  diagram: string,
  kind: string,
  thunk: () => string,
): Effect.Effect<string, DiagramRenderError> =>
  Effect.try({
    try: thunk,
    catch: (cause) => DiagramRenderError.make({ diagram: `${diagram}.${kind}`, detail: detailOf(cause) }),
  })

const renderOne = (discovered: Discovered): Effect.Effect<RenderedDiagram, DiagramRenderError> =>
  Effect.gen(function*() {
    const mermaid = `${mermaidLinesOf(discovered).join('\n')}\n`
    const svg = yield* renderThrown(discovered.id, 'svg', () => renderMermaidSVG(mermaid))
    const text = yield* renderThrown(discovered.id, 'txt', () => renderMermaidASCII(mermaid, { colorMode: 'none' }))
    return { id: discovered.id, kind: discovered.kind, title: discovered.title, mermaid, svg, text }
  })

const artifactEntriesOf = (diagram: RenderedDiagram): ReadonlyArray<readonly [string, string]> => [
  [`${diagram.id}.mmd`, diagram.mermaid],
  [`${diagram.id}.svg`, diagram.svg],
  [`${diagram.id}.txt`, diagram.text],
]

const indexOf = (diagrams: ReadonlyArray<RenderedDiagram>): string =>
  [
    '# Transition Diagrams',
    '',
    ...Arr.map(diagrams, (diagram) => `- [${diagram.title}](./${diagram.id}.mmd) — ${diagram.kind}`),
    '',
  ].join('\n')

const filesOf = (diagrams: ReadonlyArray<RenderedDiagram>): ReadonlyMap<string, string> => {
  const entries: ReadonlyArray<readonly [string, string]> = [
    ...Arr.flatMap(diagrams, artifactEntriesOf),
    ['index.md', indexOf(diagrams)],
  ]
  return new Map(entries)
}

export const renderDiscovered = (
  discovered: ReadonlyArray<Discovered>,
): Effect.Effect<RenderedSet, DiagramRenderError> =>
  Effect.gen(function*() {
    const sorted = Arr.sortWith(discovered, (item) => item.id, Order.String)
    const diagrams = yield* Effect.forEach(sorted, renderOne, { concurrency: 1 })
    return { diagrams, files: filesOf(diagrams) }
  })
