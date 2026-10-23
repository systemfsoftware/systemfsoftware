import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { CacheMode } from '../Config/config.schema.js'
import { Unique } from '../Config/values.schema.js'
import {
  AgentIdentity,
  CacheKeyContext,
  CanonicalJson,
  canonicalKeyOf,
  EngineIdentity,
  type ParamValue,
  StepParams,
  uniqueSlotsOf,
} from './key.schema.js'

const CacheKeyTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/CacheKey')

export class DeriveKey extends Schema.TaggedClass<DeriveKey>()('DeriveKey', {
  mode: CacheMode,
  project: CacheKeyContext.fields.project,
  test: CacheKeyContext.fields.test,
  target: CacheKeyContext.fields.target,
  engine: EngineIdentity,
  engineVersion: Schema.String,
  app: Schema.String,
  instruction: Schema.String,
  params: StepParams,
  agent: AgentIdentity,
  modelId: Schema.String,
}) {
  static readonly [Workflow.InstrumentationBrand] = { mode: 'app.e2e.cache.mode' } as const
}

export class Keyed extends Schema.TaggedClass<Keyed>()('Keyed', {
  context: CacheKeyContext,
  canonical: CanonicalJson,
}) {
  readonly [CacheKeyTypeId] = CacheKeyTypeId
}

export class Unkeyed extends Schema.TaggedClass<Unkeyed>()('Unkeyed', {}) {
  readonly [CacheKeyTypeId] = CacheKeyTypeId
}

export const CacheKeyDecision = Schema.Union([Keyed, Unkeyed])
export type CacheKeyDecision = typeof CacheKeyDecision.Type

const isUnique = Schema.is(Unique)

const slotNamesOf = (params: StepParams): ReadonlyArray<string> => uniqueSlotsOf(params).map((slot) => slot.name)

const keyedParamOf = (slots: ReadonlyArray<string>, name: string, value: ParamValue): Schema.Json =>
  Option.match(Option.liftPredicate(value, isUnique), {
    onNone: () => value,
    onSome: () => ({ $unique: slots.indexOf(name) }),
  })

const keyedParamsOf = (params: StepParams, slots: ReadonlyArray<string>): Schema.JsonObject =>
  Object.fromEntries(Object.entries(params).map(([name, value]) => [name, keyedParamOf(slots, name, value)]))

const contextOf = (command: DeriveKey): CacheKeyContext => {
  const slots = slotNamesOf(command.params)
  return {
    project: command.project,
    test: command.test,
    target: command.target,
    engine: command.engine,
    app: command.app,
    instruction: command.instruction,
    params: keyedParamsOf(command.params, slots),
    slots,
    agent: command.agent,
  }
}

const keyedOf = (command: DeriveKey): CacheKeyDecision => {
  const context = contextOf(command)
  return new Keyed({ context, canonical: canonicalKeyOf(context) })
}

export const deriveKey = Workflow.make({
  command: DeriveKey,
  decision: CacheKeyDecision,
  error: Schema.Never,
  decide: (command): Result.Result<CacheKeyDecision, never> =>
    Result.succeed(
      Match.value(command.mode).pipe(
        Match.when('off', () => new Unkeyed({})),
        Match.whenOr('read-only', 'read-write', () => keyedOf(command)),
        Match.exhaustive,
      ),
    ),
})
