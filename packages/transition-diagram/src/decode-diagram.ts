import { Array as Arr, Option, Result, Schema } from 'effect'
import { defectsOf, type DiagramDefect } from './diagram-defects.js'
import { DiagramShapeInvalid } from './DiagramDefect.schema.js'
import type { Raw } from './shape.js'
import { TransitionDiagram } from './TransitionDiagram.schema.js'

const shapeDefectsOf = (error: { readonly message: string }): ReadonlyArray<DiagramDefect> => [
  DiagramShapeInvalid.make({ detail: error.message }),
]

const coherentOr = (
  diagram: TransitionDiagram,
): Result.Result<TransitionDiagram, ReadonlyArray<DiagramDefect>> => {
  const defects = defectsOf(diagram)
  return Option.match(Arr.head(defects), {
    onNone: (): Result.Result<TransitionDiagram, ReadonlyArray<DiagramDefect>> => Result.succeed(diagram),
    onSome: (): Result.Result<TransitionDiagram, ReadonlyArray<DiagramDefect>> => Result.fail(defects),
  })
}

export const decodeTransitionDiagram = (
  input: Raw,
): Result.Result<TransitionDiagram, ReadonlyArray<DiagramDefect>> =>
  Result.flatMap(Result.mapError(Schema.decodeUnknownResult(TransitionDiagram)(input), shapeDefectsOf), coherentOr)
