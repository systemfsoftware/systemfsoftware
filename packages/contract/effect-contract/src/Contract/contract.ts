import type { Cell } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'
import { dual } from 'effect/Function'
import { type Answer, Rejected, type TaggedValue } from '../Answer/answer.schema.js'
import type { Unavailable } from '../Answer/unavailable.schema.js'
import { OperationId } from '../Operations/operation.schema.js'
import type { Principal } from '../Principal/principal.schema.js'
import type { Access, DurableWrite, Read, Write } from './access.schema.js'
import type { Egress } from './egress.schema.js'
import type { Exposure } from './exposure.schema.js'
import { OperationName } from './operation-name.schema.js'

export const TypeId: unique symbol = Symbol.for('@systemfsoftware/effect-contract/Contract')
export type TypeId = typeof TypeId

const branded: { readonly [TypeId]: TypeId } = { [TypeId]: TypeId }

export type ValueSchema<A = unknown, I = unknown> = Schema.Codec<A, I, never, never>
export type InputSchema = ValueSchema & { readonly fields: Schema.Struct.Fields; readonly Type: object }
export type RefusalSchema = ValueSchema & { readonly Type: TaggedValue }
export type AnswerSchema = ValueSchema & { readonly Type: Answer }

export interface Spec<
  Name extends string,
  Input extends InputSchema,
  Output extends ValueSchema,
  Refusal extends RefusalSchema,
  A extends Access,
  Links extends ReadonlyArray<string>,
> {
  readonly name: Name
  readonly description: string
  readonly input: Input
  readonly output: Output
  readonly refusals: Refusal
  readonly access: A
  readonly exposure: Exposure
  readonly egress: Egress
  readonly links: Links
}

export interface Any {
  readonly [TypeId]: TypeId
  readonly name: string
  readonly description: string
  readonly input: InputSchema
  readonly output: ValueSchema
  readonly refusals: RefusalSchema
  readonly access: Access
  readonly exposure: Exposure
  readonly egress: Egress
  readonly links: ReadonlyArray<string>
  readonly completed: AnswerSchema
  readonly answer: AnswerSchema
}

const nextActionOf = <const Links extends ReadonlyArray<string>>(links: Links) =>
  Schema.Struct({
    operation: links.length === 0 ? Schema.Never : Schema.Literals(links),
    input: Schema.JsonObject,
  })

const completedOf = <Output extends Schema.Top, Next extends Schema.Top>(output: Output, next: Next) =>
  Schema.TaggedStruct('Completed', { output, next: Schema.Array(next) })

const refusedOf = <Refusal extends RefusalSchema, Next extends Schema.Top>(refusal: Refusal, next: Next) =>
  Schema.TaggedStruct('Refused', { refusal, next: Schema.Array(next) })

const acceptedOf = <Next extends Schema.Top>(next: Next) =>
  Schema.TaggedStruct('Accepted', { operation: OperationId, next: Schema.Array(next) })

const assertOperationName: (name: string) => asserts name is OperationName = (name) =>
  Schema.asserts(OperationName, name)

export const make = <
  const Name extends string,
  Input extends InputSchema,
  Output extends ValueSchema,
  Refusal extends RefusalSchema,
  A extends Read | Write,
  const Links extends ReadonlyArray<string>,
>(spec: Spec<Name, Input, Output, Refusal, A, Links>) => {
  assertOperationName(spec.name)
  const next = nextActionOf(spec.links)
  const completed = completedOf(spec.output, next)
  return {
    ...branded,
    ...spec,
    completed,
    answer: Schema.Union([completed, refusedOf(spec.refusals, next), Rejected]),
  }
}

export const durable = <
  const Name extends string,
  Input extends InputSchema,
  Output extends ValueSchema,
  Refusal extends RefusalSchema,
  A extends DurableWrite,
  const Links extends ReadonlyArray<string>,
>(spec: Spec<Name, Input, Output, Refusal, A, Links>) => {
  assertOperationName(spec.name)
  const next = nextActionOf(spec.links)
  const completed = completedOf(spec.output, next)
  return {
    ...branded,
    ...spec,
    completed,
    answer: Schema.Union([completed, refusedOf(spec.refusals, next), Rejected, acceptedOf(next)]),
  }
}

export interface Invocation {
  readonly input: Schema.Json
  readonly principal: Principal
}

export interface CellNeverAnswersRejected {
  readonly __CAPABILITY_CELL_MUST_ANSWER_REJECTED_FROM_ITS_DECODE_PHASE__: true
}

export type AnswersRejected<A> = [Extract<A, Rejected>] extends [never] ? CellNeverAnswersRejected : object

export type CellOf<C extends Any, R = never> = Cell.Cell<Invocation, C['answer']['Type'], Unavailable, R>

export interface Capability<C extends Any = Any, R = never> {
  readonly contract: C
  readonly cell: CellOf<C, R>
}

export const implement: {
  <C extends Any, A extends C['answer']['Type']>(
    cell: Cell.Cell<Invocation, A, Unavailable> & AnswersRejected<A>,
  ): (contract: C) => Capability<C>
  <C extends Any, A extends C['answer']['Type']>(
    contract: C,
    cell: Cell.Cell<Invocation, A, Unavailable> & AnswersRejected<A>,
  ): Capability<C>
} = dual(2, <C extends Any>(contract: C, cell: CellOf<C>): Capability<C> => ({ contract, cell }))
