import { Array as Arr, Option, Order, Schema } from 'effect'
import * as SchemaAST from 'effect/SchemaAST'
import { flowchartLabelOf, mermaidIdOf } from './diagram-id.js'
import { asNonEmptyString, type Raw } from './shape.js'
import type { WorkflowSchemasLike } from './WorkflowSchemas.schema.js'

export interface WorkflowDiagramInput {
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

const outcomeId = (prefix: string, index: number, tag: string): string => mermaidIdOf(`${prefix}${index}_${tag}`)

export const workflowToMermaid = (input: WorkflowDiagramInput): ReadonlyArray<string> => {
  const commandLabel = Option.getOrElse(firstTagOf(input.schemas.command), () => input.title)
  const decisionTags = variantTagsOf(input.schemas.decision)
  const errorTags = variantTagsOf(input.schemas.error)
  return [
    'flowchart LR',
    `  cmd["${flowchartLabelOf(commandLabel)}"]`,
    '  dec{"decision"}',
    '  cmd --> dec',
    ...Arr.map(
      decisionTags,
      (tag, index) => `  dec -->|"${flowchartLabelOf(tag)}"| ${outcomeId('v', index, tag)}["${flowchartLabelOf(tag)}"]`,
    ),
    ...Arr.map(
      errorTags,
      (tag, index) =>
        `  dec -.->|"${flowchartLabelOf(tag)}"| ${outcomeId('e', index, tag)}["${flowchartLabelOf(tag)}"]`,
    ),
  ]
}
