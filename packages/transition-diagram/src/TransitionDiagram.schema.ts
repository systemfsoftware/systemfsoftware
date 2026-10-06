import { Schema } from 'effect'
import { DiagramId } from './Diagram.schema.js'

export const StateId = Schema.NonEmptyString.pipe(
  Schema.check(Schema.isPattern(/^[A-Za-z0-9_]+$/)),
  Schema.brand('@systemfsoftware/transition-diagram/StateId'),
)
export type StateId = typeof StateId.Type

export const DiagramNodeKind = Schema.Literals(['initial', 'decision', 'outcome', 'error', 'final'])
export type DiagramNodeKind = typeof DiagramNodeKind.Type

export const DiagramEdgeKind = Schema.Literals(['normal', 'error'])
export type DiagramEdgeKind = typeof DiagramEdgeKind.Type

export const DiagramState = Schema.Struct({
  id: StateId,
  label: Schema.NonEmptyString,
  kind: DiagramNodeKind,
})
export type DiagramState = typeof DiagramState.Type

export const DiagramTransition = Schema.Struct({
  from: StateId,
  to: StateId,
  event: Schema.optional(Schema.NonEmptyString),
  guard: Schema.optional(Schema.NonEmptyString),
  kind: DiagramEdgeKind,
})
export type DiagramTransition = typeof DiagramTransition.Type

export const TransitionDiagram = Schema.Struct({
  id: DiagramId,
  title: Schema.NonEmptyString,
  states: Schema.NonEmptyArray(DiagramState),
  transitions: Schema.Array(DiagramTransition),
})
export type TransitionDiagram = typeof TransitionDiagram.Type
