import { Effect, Match, Option, Schema, SchemaAST } from 'effect'
import { Flag } from 'effect/cli'
import { dual } from 'effect/Function'
import * as Result from 'effect/Result'
import { Contract } from '../../mod.js'

export type ReservedFlagName = 'json' | 'target' | 'input'

export interface ReservedFlagNameCollision<Key extends string> {
  readonly __CLI_FLAG_NAME_IS_RESERVED__: `input field '${Key}' collides with the reserved --${Key} flag`
}

export type ReservedKeys<Fields extends Schema.Struct.Fields> = Extract<keyof Fields, ReservedFlagName>

export type NoReservedFlagName<Fields extends Schema.Struct.Fields> = [ReservedKeys<Fields>] extends [never] ? object
  : { readonly [K in ReservedKeys<Fields> & string]: ReservedFlagNameCollision<K> }

export type FlagConfigOf = Record<string, Flag.Flag<Option.Option<Schema.Json>>>

type FieldKind = 'String' | 'Number' | 'Boolean' | 'Json'

const kindOf = (ast: SchemaAST.AST): FieldKind =>
  Match.value(ast).pipe(
    Match.tag('Number', (): FieldKind => 'Number'),
    Match.tag('Boolean', (): FieldKind => 'Boolean'),
    Match.tag('String', (): FieldKind => 'String'),
    Match.tag('BigInt', (): FieldKind => 'String'),
    Match.tag('Symbol', (): FieldKind => 'String'),
    Match.tag('UniqueSymbol', (): FieldKind => 'String'),
    Match.tag('Literal', (): FieldKind => 'String'),
    Match.tag('Enum', (): FieldKind => 'String'),
    Match.tag('TemplateLiteral', (): FieldKind => 'String'),
    Match.tag('Null', (): FieldKind => 'String'),
    Match.tag('Undefined', (): FieldKind => 'String'),
    Match.tag('Void', (): FieldKind => 'String'),
    Match.orElse((): FieldKind => 'Json'),
  )

const flagOf = (name: string, field: Schema.Constraint): Flag.Flag<Option.Option<Schema.Json>> => {
  const base: Flag.Flag<Schema.Json> = Match.value(kindOf(field.ast)).pipe(
    Match.when('Number', () => Flag.Finite(name)),
    Match.when('Boolean', () => Flag.Boolean(name)),
    Match.when('String', () => Flag.String(name)),
    Match.when('Json', () => Flag.String(name)),
    Match.exhaustive,
  )
  return base.pipe(Flag.optional)
}

export const flagsOf = <const Fields extends Schema.Struct.Fields>(
  fields: Fields & NoReservedFlagName<Fields>,
): FlagConfigOf => Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, flagOf(name, field)]))

const rejected = (issue: string): Contract.Rejected => ({ _tag: 'Rejected', issue })

const jsonValueOf = (value: Schema.Json): Effect.Effect<Schema.Json, Contract.Rejected> =>
  Schema.is(Schema.String)(value)
    ? Result.match(Schema.decodeResult(Schema.fromJsonString(Schema.Json))(value), {
      onFailure: (error) => Effect.fail(rejected(error.message)),
      onSuccess: (decoded) => Effect.succeed(decoded),
    })
    : Effect.fail(rejected('a nested or union field takes JSON text'))

interface FieldValueOf {
  (kind: FieldKind, value: Schema.Json): Effect.Effect<Schema.Json, Contract.Rejected>
  (value: Schema.Json): (kind: FieldKind) => Effect.Effect<Schema.Json, Contract.Rejected>
}

const fieldValueOf: FieldValueOf = dual(2, (kind: FieldKind, value: Schema.Json) =>
  Match.value(kind).pipe(
    Match.when('Json', () => jsonValueOf(value)),
    Match.orElse(() => Effect.succeed(value)),
  ))

type FieldEntry = Option.Option<readonly [string, Schema.Json]>

const entryOf = (
  name: string,
  field: Schema.Constraint,
  value: Option.Option<Schema.Json>,
): Effect.Effect<FieldEntry, Contract.Rejected> =>
  Option.match(value, {
    onNone: (): Effect.Effect<FieldEntry, Contract.Rejected> => Effect.succeedNone,
    onSome: (present) =>
      Effect.map(fieldValueOf(kindOf(field.ast), present), (decoded): FieldEntry =>
        Option.some([name, decoded] as const)),
  })

export interface InputOf {
  (
    contract: Contract.Any,
    values: Record<string, Option.Option<Schema.Json>>,
  ): Effect.Effect<Schema.Json, Contract.Rejected>
  (
    values: Record<string, Option.Option<Schema.Json>>,
  ): (contract: Contract.Any) => Effect.Effect<Schema.Json, Contract.Rejected>
}

export const inputOf: InputOf = dual(
  2,
  (
    contract: Contract.Any,
    values: Record<string, Option.Option<Schema.Json>>,
  ): Effect.Effect<Schema.Json, Contract.Rejected> =>
    Effect.map(
      Effect.forEach(
        Object.entries(contract.input.fields),
        ([name, field]) => entryOf(name, field, Option.flatten(Option.fromUndefinedOr(values[name]))),
      ),
      (entries): Schema.Json =>
        Object.fromEntries(entries.flatMap((entry) => Option.isSome(entry) ? [entry.value] : [])),
    ),
)

export const inputFromJson = (text: string): Effect.Effect<Schema.Json, Contract.Rejected> =>
  Result.match(Schema.decodeResult(Schema.fromJsonString(Schema.Json))(text), {
    onFailure: (error) => Effect.fail(rejected(error.message)),
    onSuccess: (decoded) => Effect.succeed(decoded),
  })
