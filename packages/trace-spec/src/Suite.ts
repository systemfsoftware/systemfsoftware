import { Suite as Runtime } from '@systemfsoftware/effect-spec-runtime'
import { Cause, Effect, type FileSystem, type Layer, Schema } from 'effect'
import { dual } from 'effect/Function'
import { type Pipeable, Prototype } from 'effect/Pipeable'
import type * as fc from 'fast-check'
import * as Contract from './Contract.js'
import { ContractDecodeError } from './ContractDecodeError.schema.js'
import { EmptyObservationError } from './EmptyObservationError.schema.js'
import type { Observation } from './Observation.service.js'
import * as Prop from './Prop.js'
import { StimulusFailure } from './StimulusFailure.schema.js'
import * as TaskAnnounce from './TaskAnnounce.js'
import { TraceDisparityError } from './TraceDisparityError.schema.js'

export { StimulusFailure }

export const TypeId = Symbol.for('@systemfsoftware/trace-spec/Suite')
export type TypeId = typeof TypeId

export type CaseFailure = ContractDecodeError | EmptyObservationError | TraceDisparityError | StimulusFailure

export type Harness = Observation | FileSystem.FileSystem

export interface CaseRegistrar<Provided> {
  <Input, Output, E>(
    name: string,
    contract: Contract.Contract<Input, Output, E, Provided>,
    input: Input,
  ): void
  prop: <Input, Output, E>(
    name: string,
    contract: Contract.Contract<Input, Output, E, Provided>,
    arbitrary: fc.Arbitrary<Input>,
  ) => void
}

export interface CaseTools<Provided> {
  readonly Case: CaseRegistrar<Provided>
}

export interface Opened<Provided> {
  readonly body: (use: (tools: CaseTools<Provided>) => void) => void
}

export interface Declared extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly withLayer: <SharedProvided>(shared: Layer.Layer<SharedProvided | Harness>) => Shared<SharedProvided>
  readonly withScenarioLayer: <Provided>(scenario: Layer.Layer<Provided | Harness>) => Opened<Provided | Harness>
}

export interface Shared<SharedProvided> extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly withScenarioLayer: <Provided>(
    scenario: Layer.Layer<Provided | Harness>,
  ) => Opened<Provided | SharedProvided>
  readonly body: (use: (tools: CaseTools<SharedProvided>) => void) => void
}

const isCheckFailure = Schema.is(Schema.Union([ContractDecodeError, EmptyObservationError, TraceDisparityError]))

const caseFailureOf = (stimulus: string) => <E>(failure: E | CaseFailure): CaseFailure =>
  isCheckFailure(failure)
    ? failure
    : new StimulusFailure({ stimulus, detail: Cause.pretty(Cause.fail(failure)) })

const rethrowAfter = (
  annotation: Effect.Effect<void>,
  error: TraceDisparityError,
): Effect.Effect<never, TraceDisparityError> => Effect.andThen(annotation, () => Effect.fail(error))

const annotateDisparity = (error: TraceDisparityError): Effect.Effect<never, TraceDisparityError> =>
  rethrowAfter(TaskAnnounce.announceDump(error), error)

const caseBody = <Input, Output, E, Provided>(
  contract: Contract.Contract<Input, Output, E, Provided>,
  input: Input,
): Effect.Effect<void, CaseFailure, Provided | Harness> =>
  Contract.check(contract, input).pipe(
    Effect.catchIf(Schema.is(TraceDisparityError), annotateDisparity),
    Effect.asVoid,
    Effect.mapError(caseFailureOf(contract.stimulus.name)),
  )

const caseTools = <Provided>(
  register: Runtime.RegisterFn<void, CaseFailure, Provided | Harness>,
): CaseTools<Provided | Harness> => {
  const Case: CaseRegistrar<Provided | Harness> = (name, contract, input) =>
    register(name, caseBody(contract, input), 'run')
  Case.prop = (name, contract, arbitrary) => register(name, Prop.body(contract, arbitrary), 'run')
  return { Case }
}

const config = (name: string): Runtime.Config => ({ name, describe: 'describe', options: undefined, liveClock: true })

const openScenario = <ROut>(
  bindings: Runtime.Bindings,
  name: string,
  scenario: Layer.Layer<ROut | Harness>,
): Opened<ROut | Harness> => ({
  body: (use) =>
    Runtime.openCase(
      bindings,
      config(name),
      scenario,
      (register: Runtime.RegisterFn<void, CaseFailure, ROut | Harness>) => use(caseTools(register)),
    ),
})

const openSharedScenario = <SharedProvided, Provided>(
  bindings: Runtime.Bindings,
  name: string,
  shared: Layer.Layer<SharedProvided | Harness>,
  scenario: Layer.Layer<Provided | Harness>,
): Opened<Provided | SharedProvided> => ({
  body: (use) =>
    Runtime.openSharedCase(
      bindings,
      config(name),
      { layer: shared, excludeTestServices: false },
      scenario,
      (register: Runtime.RegisterFn<void, CaseFailure, Provided | SharedProvided | Harness>) =>
        use(caseTools(register)),
    ),
})

const openShared = <SharedProvided>(
  bindings: Runtime.Bindings,
  name: string,
  shared: Layer.Layer<SharedProvided | Harness>,
): Shared<SharedProvided> => ({
  [TypeId]: TypeId,
  body: (use) =>
    Runtime.openShared(
      bindings,
      config(name),
      { layer: shared, excludeTestServices: false },
      (register: Runtime.RegisterFn<void, CaseFailure, SharedProvided | Harness>) => use(caseTools(register)),
    ),
  withScenarioLayer: (scenario) => openSharedScenario(bindings, name, shared, scenario),
  ...Prototype,
})

const withLayerDual = <SharedProvided>(
  self: Declared,
  shared: Layer.Layer<SharedProvided | Harness>,
): Shared<SharedProvided> => self.withLayer(shared)

export const withLayer: {
  <SharedProvided>(shared: Layer.Layer<SharedProvided | Harness>): (self: Declared) => Shared<SharedProvided>
  <SharedProvided>(self: Declared, shared: Layer.Layer<SharedProvided | Harness>): Shared<SharedProvided>
} = dual(2, withLayerDual)

const withScenarioLayerDual = <Provided>(
  self: Declared,
  scenario: Layer.Layer<Provided | Harness>,
): Opened<Provided | Harness> => self.withScenarioLayer(scenario)

export const withScenarioLayer: {
  <Provided>(scenario: Layer.Layer<Provided | Harness>): (self: Declared) => Opened<Provided | Harness>
  <Provided>(self: Declared, scenario: Layer.Layer<Provided | Harness>): Opened<Provided | Harness>
} = dual(2, withScenarioLayerDual)

export const make = (bindings: Runtime.Bindings) => (name: string): Declared => ({
  [TypeId]: TypeId,
  withLayer: (shared) => openShared(bindings, name, shared),
  withScenarioLayer: (scenario) => openScenario(bindings, name, scenario),
  ...Prototype,
})
