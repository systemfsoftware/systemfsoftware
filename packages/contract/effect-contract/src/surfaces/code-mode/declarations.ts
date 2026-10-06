import { Array as Arr, Match, Option, Schema } from 'effect'
import type * as JsonSchema from 'effect/JsonSchema'
import type { Catalog, Entry, JsonSchemaDocument } from '../../Catalog/mod.js'
import { Contract } from '../../mod.js'

type Node = Schema.Json

const EMPTY: Readonly<Record<string, Node>> = {}

const REF_PREFIXES: ReadonlyArray<string> = ['#/$defs/', '#/definitions/']

interface Scope {
  readonly definitions: Readonly<Record<string, Node>>
  readonly visiting: ReadonlySet<string>
}

const jsonOf = (value: JsonSchema.JsonSchema | JsonSchema.Definitions): Option.Option<Node> =>
  Schema.decodeUnknownOption(Schema.Json)(value)

const recordOf = (value: Node): Option.Option<Readonly<Record<string, Node>>> =>
  Schema.is(Schema.Record(Schema.String, Schema.Json))(value) ? Option.some(value) : Option.none()

const arrayOf = (value: Node): ReadonlyArray<Node> => Schema.is(Schema.Array(Schema.Json))(value) ? value : []

const field = (schema: Node, key: string): Option.Option<Node> =>
  Option.flatMap(recordOf(schema), (record) => Option.fromUndefinedOr(record[key]))

const stringField = (schema: Node, key: string): Option.Option<string> =>
  Option.flatMap(field(schema, key), (value) => typeof value === 'string' ? Option.some(value) : Option.none())

const stringList = (values: ReadonlyArray<Node>): ReadonlyArray<string> =>
  Arr.getSomes(Arr.map(values, (value) => typeof value === 'string' ? Option.some(value) : Option.none()))

const arrayField = (schema: Node, key: string): ReadonlyArray<Node> =>
  Option.getOrElse(Option.map(field(schema, key), arrayOf), () => [])

const definitionsOf = (document: JsonSchemaDocument): Readonly<Record<string, Node>> =>
  Option.getOrElse(Option.flatMap(jsonOf(document.definitions), recordOf), () => EMPTY)

const scopeOf = (document: JsonSchemaDocument): Scope => ({ definitions: definitionsOf(document), visiting: new Set() })

const rootOf = (document: JsonSchemaDocument): Node => Option.getOrElse(jsonOf(document.schema), () => null)

const extended = (name: string, scope: Scope, definition: Node): string =>
  typeOf(definition, { definitions: scope.definitions, visiting: new Set([...scope.visiting, name]) })

const referenced = (name: string, scope: Scope): string =>
  scope.visiting.has(name)
    ? 'unknown'
    : Option.match(Option.fromUndefinedOr(scope.definitions[name]), {
      onNone: () => 'unknown',
      onSome: (definition) => extended(name, scope, definition),
    })

const referenceName = (schema: Node): Option.Option<string> =>
  Option.flatMap(
    stringField(schema, '$ref'),
    (ref) =>
      Option.map(Arr.findFirst(REF_PREFIXES, (prefix) => ref.startsWith(prefix)), (prefix) => ref.slice(prefix.length)),
  )

const referenceType = (schema: Node, scope: Scope): Option.Option<string> =>
  Option.flatMap(referenceName(schema), (name) => Option.some(referenced(name, scope)))

const constType = (schema: Node): Option.Option<string> =>
  Option.flatMap(
    field(schema, 'const'),
    (value) => typeof value === 'string' ? Option.some(JSON.stringify(value)) : Option.none(),
  )

const literalList = (values: ReadonlyArray<Node>): Option.Option<string> =>
  values.length === 0
    ? Option.none()
    : Option.map(
      Option.filter(Option.some(values), (candidates) => Arr.length(candidates) === Arr.length(stringList(candidates))),
      (candidates) => Arr.join(Arr.map(stringList(candidates), (value) => JSON.stringify(value)), ' | '),
    )

const enumType = (schema: Node): Option.Option<string> =>
  Option.flatMap(field(schema, 'enum'), (value) => literalList(arrayOf(value)))

const literalType = (schema: Node): Option.Option<string> => Option.orElse(constType(schema), () => enumType(schema))

const membersOf = (schema: Node, key: string): Option.Option<ReadonlyArray<Node>> =>
  Option.flatMap(field(schema, key), (value) => Option.some(arrayOf(value)))

const membersUnion = (schema: Node, key: string, scope: Scope, separator: string): Option.Option<string> =>
  Option.map(
    membersOf(schema, key),
    (members) => Arr.join(Arr.map(members, (member) => typeOf(member, scope)), separator),
  )

const combinatorType = (schema: Node, scope: Scope): Option.Option<string> =>
  Option.orElse(
    membersUnion(schema, 'anyOf', scope, ' | '),
    () => Option.orElse(membersUnion(schema, 'oneOf', scope, ' | '), () => membersUnion(schema, 'allOf', scope, ' & ')),
  )

const propertyEntries = (schema: Node): Option.Option<ReadonlyArray<readonly [string, Node]>> =>
  Option.flatMap(
    field(schema, 'properties'),
    (value) => Option.map(recordOf(value), (record) => Object.entries(record)),
  )

const requiredOf = (schema: Node): ReadonlyArray<string> => stringList(arrayField(schema, 'required'))

const openMembers = (schema: Node): ReadonlyArray<string> =>
  Option.isSome(Option.filter(field(schema, 'additionalProperties'), (value) => value === true))
    ? ['readonly [key: string]: unknown']
    : []

const memberType = (name: string, property: Node, required: ReadonlyArray<string>, scope: Scope): string =>
  `readonly ${JSON.stringify(name)}${required.includes(name) ? '' : '?'}: ${typeOf(property, scope)}`

const objectLiteral = (
  properties: ReadonlyArray<readonly [string, Node]>,
  schema: Node,
  scope: Scope,
): string => {
  const required = requiredOf(schema)
  const members = Arr.map(properties, ([name, property]) => memberType(name, property, required, scope))
  return `{ ${Arr.join(Arr.appendAll(members, openMembers(schema)), '; ')} }`
}

const objectType = (schema: Node, scope: Scope): Option.Option<string> =>
  Option.map(propertyEntries(schema), (properties) => objectLiteral(properties, schema, scope))

const codeOf = (schema: Node, key: string): string => Option.getOrElse(stringField(schema, key), () => '')

const itemsType = (schema: Node, scope: Scope): string =>
  typeOf(Option.getOrElse(field(schema, 'items'), () => null), scope)

const primitiveType = (schema: Node, scope: Scope): string =>
  Match.value(codeOf(schema, 'type')).pipe(
    Match.when('string', () => 'string'),
    Match.when('integer', () => 'number'),
    Match.when('number', () => 'number'),
    Match.when('boolean', () => 'boolean'),
    Match.when('null', () => 'null'),
    Match.when('array', () => `ReadonlyArray<${itemsType(schema, scope)}>`),
    Match.when('object', () => 'Readonly<Record<string, unknown>>'),
    Match.orElse(() => 'unknown'),
  )

const structuralType = (schema: Node, scope: Scope): string =>
  Option.getOrElse(objectType(schema, scope), () => primitiveType(schema, scope))

function typeOf(schema: Node, scope: Scope): string {
  return Option.getOrElse(
    referenceType(schema, scope),
    () =>
      Option.getOrElse(
        literalType(schema),
        () => Option.getOrElse(combinatorType(schema, scope), () => structuralType(schema, scope)),
      ),
  )
}

const accessText = (entry: Entry): string =>
  Match.value(entry.access).pipe(
    Match.tag('Read', (read) => `Read(${read.cache._tag})`),
    Match.tag('Write', (write) => `Write(${write.risk})`),
    Match.tag('DurableWrite', (write) => `DurableWrite(${write.risk})`),
    Match.exhaustive,
  )

const egressText = (entry: Entry): string =>
  Match.value(entry.egress).pipe(
    Match.tag('Closed', () => 'closed'),
    Match.tag('AllowList', (allowList) => `allow-list: ${Arr.join(allowList.hosts, ', ')}`),
    Match.exhaustive,
  )

const listed = (values: ReadonlyArray<string>): string => values.length === 0 ? 'none' : Arr.join(values, ', ')

const docCommentOf = (entry: Entry): ReadonlyArray<string> => [
  '  /**',
  `   * ${entry.description}`,
  '   *',
  `   * access: ${accessText(entry)}; egress: ${egressText(entry)}`,
  `   * refusals: ${listed(entry.refusalTags)}; next: ${listed(entry.links)}`,
  '   */',
]

const isDurable = (entry: Entry): boolean => Schema.is(Contract.DurableWrite)(entry.access)

const refusalType = (entry: Entry): string =>
  entry.refusalTags.length === 0 ? 'never' : typeOf(rootOf(entry.refusals), scopeOf(entry.refusals))

const durableAnswer = (entry: Entry, answer: string): string =>
  isDurable(entry) ? `${answer} | CodeModeAccepted` : answer

const answerType = (entry: Entry): string =>
  durableAnswer(entry, `CodeModeAnswer<${typeOf(rootOf(entry.output), scopeOf(entry.output))}, ${refusalType(entry)}>`)

const signatureOf = (entry: Entry): string =>
  `  readonly ${entry.name}: (input: ${typeOf(rootOf(entry.input), scopeOf(entry.input))}) => Promise<${
    answerType(entry)
  }>`

const toolOf = (entry: Entry): string => Arr.join(Arr.append(docCommentOf(entry), signatureOf(entry)), '\n')

const preamble: ReadonlyArray<string> = [
  'type CodeModeNextAction = { readonly operation: string; readonly input: { readonly [key: string]: unknown } }',
  'type CodeModeAnswer<Output, Refusal> =',
  '  | { readonly _tag: "Completed"; readonly output: Output; readonly next: ReadonlyArray<CodeModeNextAction> }',
  '  | { readonly _tag: "Refused"; readonly refusal: Refusal; readonly next: ReadonlyArray<CodeModeNextAction> }',
  '  | { readonly _tag: "Rejected"; readonly issue: string }',
  'type CodeModeAccepted = { readonly _tag: "Accepted"; readonly operation: string; readonly next: ReadonlyArray<CodeModeNextAction> }',
]

export const declarationsOf = (catalog: Catalog): string =>
  Arr.join([...preamble, 'declare const tools: {', ...Arr.map(Object.values(catalog), toolOf), '}', ''], '\n')
