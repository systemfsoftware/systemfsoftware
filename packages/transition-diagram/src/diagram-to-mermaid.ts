import { Array as Arr, Option } from 'effect'
import { flowchartLabelOf, mermaidIdOf } from './diagram-id.js'
import type {
  DiagramEdgeKind,
  DiagramNodeKind,
  DiagramState,
  DiagramTransition,
  StateId,
  TransitionDiagram,
} from './TransitionDiagram.schema.js'

const SHAPE_BY_KIND: Record<DiagramNodeKind, (label: string) => string> = {
  decision: (label) => `{"${label}"}`,
  final: (label) => `(["${label}"])`,
  initial: (label) => `["${label}"]`,
  outcome: (label) => `["${label}"]`,
  error: (label) => `["${label}"]`,
}

const STANDS_ALONE_BY_KIND: Record<DiagramNodeKind, boolean> = {
  decision: true,
  final: false,
  initial: true,
  outcome: false,
  error: false,
}

const ARROW_BY_EDGE_KIND: Record<DiagramEdgeKind, string> = {
  normal: '-->',
  error: '-.->',
}

const shapeOf = (kind: DiagramNodeKind, label: string): string => SHAPE_BY_KIND[kind](label)

const standsAloneOf = (kind: DiagramNodeKind): boolean => STANDS_ALONE_BY_KIND[kind]

const declarationOf = (state: DiagramState): string =>
  `  ${mermaidIdOf(state.id)}${shapeOf(state.kind, flowchartLabelOf(state.label))}`

const inlineShapesOf = (states: ReadonlyArray<DiagramState>): ReadonlyMap<StateId, string> =>
  new Map(
    Arr.map(
      Arr.filter(states, (state) => !standsAloneOf(state.kind)),
      (state) => [state.id, shapeOf(state.kind, flowchartLabelOf(state.label))] as const,
    ),
  )

const targetShapeOf = (shapes: ReadonlyMap<StateId, string>, id: StateId): string =>
  Option.getOrElse(Option.fromNullishOr(shapes.get(id)), () => '')

const guardLabelOf = (guard: string): string => `[${flowchartLabelOf(guard)}]`

const eventTextOf = (transition: DiagramTransition): string =>
  Option.match(Option.fromNullishOr(transition.event), {
    onNone: () => '',
    onSome: (event) => `${flowchartLabelOf(event)} `,
  })

const labelOf = (transition: DiagramTransition): Option.Option<string> =>
  Option.match(Option.fromNullishOr(transition.guard), {
    onNone: () => Option.map(Option.fromNullishOr(transition.event), flowchartLabelOf),
    onSome: (guard) => Option.some(`${eventTextOf(transition)}${guardLabelOf(guard)}`),
  })

const edgeOf = (shapes: ReadonlyMap<StateId, string>, transition: DiagramTransition): string => {
  const from = mermaidIdOf(transition.from)
  const to = `${mermaidIdOf(transition.to)}${targetShapeOf(shapes, transition.to)}`
  const arrow = ARROW_BY_EDGE_KIND[transition.kind]
  return Option.match(labelOf(transition), {
    onNone: () => `  ${from} ${arrow} ${to}`,
    onSome: (label) => `  ${from} ${arrow}|"${label}"| ${to}`,
  })
}

export const diagramToMermaid = (diagram: TransitionDiagram): ReadonlyArray<string> => {
  const shapes = inlineShapesOf(diagram.states)
  return [
    'flowchart LR',
    ...Arr.map(Arr.filter(diagram.states, (state) => standsAloneOf(state.kind)), declarationOf),
    ...Arr.map(diagram.transitions, (transition) => edgeOf(shapes, transition)),
  ]
}
