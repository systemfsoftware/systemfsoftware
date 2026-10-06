import { Array as Arr, Option, Order, Schema } from 'effect'
import * as SchemaAST from 'effect/SchemaAST'
import { makeStateId } from './diagram-id.js'
import type { DiagramId } from './Diagram.schema.js'
import { asNonEmptyString, type Raw } from './shape.js'
import type {
  DiagramEdgeKind,
  DiagramState,
  DiagramTransition,
  StateId,
  TransitionDiagram,
} from './TransitionDiagram.schema.js'
import type { WorkflowSchemasLike } from './WorkflowSchemas.schema.js'

export interface WorkflowDiagramInput {
  readonly id: DiagramId
  readonly title: string
  readonly schemas: WorkflowSchemasLike
}

const astOf = (schema: Raw): Option.Option<SchemaAST.AST> =>
  Option.map(Option.fromNullishOr(Schema.isSchema(schema) ? schema : undefined), (top) => top.ast)

const unwrapArrays = (ast: SchemaAST.AST): ReadonlyArray<SchemaAST.AST> =>
  SchemaAST.isArrays(ast) ? [...ast.elements, ...ast.rest] : [ast]

const expandUnion = (ast: SchemaAST.AST): ReadonlyArray<SchemaAST.AST> => SchemaAST.isUnion(ast) ? ast.types : [ast]

const memberAstsOf = (ast: SchemaAST.AST): ReadonlyArray<SchemaAST.AST> => Arr.flatMap(unwrapArrays(ast), expandUnion)

const resolveSuspend = (ast: SchemaAST.AST): SchemaAST.AST => SchemaAST.isSuspend(ast) ? ast.thunk() : ast

const directObjectsOf = (ast: SchemaAST.AST): Option.Option<SchemaAST.Objects> =>
  SchemaAST.isObjects(ast) ? Option.some(ast) : Option.none()

const declarationObjectsOf = (ast: SchemaAST.AST): Option.Option<SchemaAST.Objects> =>
  SchemaAST.isDeclaration(ast)
    ? Option.flatMap(Arr.findFirst(ast.typeParameters, SchemaAST.isObjects), directObjectsOf)
    : Option.none()

const objectsOf = (ast: SchemaAST.AST): Option.Option<SchemaAST.Objects> => {
  const resolved = resolveSuspend(ast)
  return Option.orElse(directObjectsOf(resolved), () => declarationObjectsOf(resolved))
}

const propertyTypeOf = (objects: SchemaAST.Objects, name: string): Option.Option<SchemaAST.AST> =>
  Option.map(
    Arr.findFirst(objects.propertySignatures, (signature) => signature.name === name),
    (signature) => signature.type,
  )

const literalValueOf = (ast: SchemaAST.AST): Raw => SchemaAST.isLiteral(ast) ? ast.literal : undefined

const tagOf = (ast: SchemaAST.AST): Option.Option<string> =>
  Option.flatMap(
    objectsOf(ast),
    (objects) =>
      Option.flatMap(propertyTypeOf(objects, '_tag'), (property) =>
        Option.fromNullishOr(asNonEmptyString(literalValueOf(property)))),
  )

const memberAstsFor = (schema: Raw): ReadonlyArray<SchemaAST.AST> =>
  Option.match(astOf(schema), { onNone: () => [], onSome: memberAstsOf })

const variantTagsOf = (schema: Raw): ReadonlyArray<string> =>
  Arr.sort(Order.String)(Arr.getSomes(Arr.map(memberAstsFor(schema), tagOf)))

const firstTagOf = (schema: Raw): Option.Option<string> => Option.flatMap(astOf(schema), tagOf)

const ENTRY_ID = 'cmd'
const DECISION_ID = 'dec'
const DECISION_LABEL = 'decision'
const OUTCOME_PREFIX = 'v'
const ERROR_PREFIX = 'e'
const UNTITLED = 'diagram'

const titleOf = (raw: string): string => Option.getOrElse(Option.fromNullishOr(asNonEmptyString(raw)), () => UNTITLED)

const entryStateOf = (label: string): DiagramState => ({ id: makeStateId(ENTRY_ID), label, kind: 'initial' })

const decisionStateOf = (): DiagramState => ({
  id: makeStateId(DECISION_ID),
  label: DECISION_LABEL,
  kind: 'decision',
})

const resultStateOf = (prefix: string, index: number, tag: string, kind: 'outcome' | 'error'): DiagramState => ({
  id: makeStateId(`${prefix}${index}_${tag}`),
  label: tag,
  kind,
})

const silentEdgeOf = (from: StateId, to: StateId): DiagramTransition => ({ from, to, kind: 'normal' })

const labelledEdgeOf = (
  from: StateId,
  to: StateId,
  event: string,
  kind: DiagramEdgeKind,
): DiagramTransition => ({ from, to, event, kind })

export const workflowToDiagram = (input: WorkflowDiagramInput): TransitionDiagram => {
  const title = titleOf(input.title)
  const entry = entryStateOf(Option.getOrElse(firstTagOf(input.schemas.command), () => title))
  const decision = decisionStateOf()
  const outcomes = Arr.map(
    variantTagsOf(input.schemas.decision),
    (tag, index) => resultStateOf(OUTCOME_PREFIX, index, tag, 'outcome'),
  )
  const errors = Arr.map(
    variantTagsOf(input.schemas.error),
    (tag, index) => resultStateOf(ERROR_PREFIX, index, tag, 'error'),
  )
  return {
    id: input.id,
    title,
    states: [entry, decision, ...outcomes, ...errors],
    transitions: [
      silentEdgeOf(entry.id, decision.id),
      ...Arr.map(outcomes, (state) => labelledEdgeOf(decision.id, state.id, state.label, 'normal')),
      ...Arr.map(errors, (state) => labelledEdgeOf(decision.id, state.id, state.label, 'error')),
    ],
  }
}
