import { Suite as Runtime } from '@systemfsoftware/effect-spec-runtime'
import { Cause, Effect, type FileSystem, type Layer, Schema } from 'effect'
import type * as fc from 'fast-check'
import * as Contract from './Contract.js'
import { ContractDecodeError } from './ContractDecodeError.schema.js'
import { EmptyObservationError } from './EmptyObservationError.schema.js'
import type { Observation } from './Observe.js'
import * as Prop from './Prop.js'
import { StimulusFailure } from './StimulusFailure.schema.js'
import * as TaskAnnounce from './TaskAnnounce.js'
import { TraceDisparityError } from './TraceDisparityError.schema.js'

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

export interface Shared<SharedProvided> extends Opened<SharedProvided> {
  readonly withScenarioLayer: <Provided>(scenario: Layer.Layer<Provided | Harness>) => Opened<Provided | SharedProvided>
}

export interface Declared {
  readonly withLayer: <SharedProvided>(
    shared: Layer.Layer<SharedProvided | Harness>,
  ) => Shared<SharedProvided>
  readonly withScenarioLayer: <Provided>(scenario: Layer.Layer<Provided | Harness>) => Opened<Provided | Harness>
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

const propBody = <Input, Output, E, Provided>(
  contract: Contract.Contract<Input, Output, E, Provided>,
  arbitrary: fc.Arbitrary<Input>,
): Effect.Effect<void, CaseFailure, Provided | Harness> => Prop.body(contract, arbitrary)

const caseTools = <Provided>(
  register: Runtime.RegisterFn<void, CaseFailure, Provided | Harness>,
): CaseTools<Provided | Harness> => {
  const Case: CaseRegistrar<Provided | Harness> = (name, contract, input) =>
    register(name, caseBody(contract, input), 'run')
  Case.prop = (name, contract, arbitrary) => register(name, propBody(contract, arbitrary), 'run')
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
  body: (use) =>
    Runtime.openShared(
      bindings,
      config(name),
      { layer: shared, excludeTestServices: false },
      (register: Runtime.RegisterFn<void, CaseFailure, SharedProvided | Harness>) => use(caseTools(register)),
    ),
  withScenarioLayer: (scenario) => openSharedScenario(bindings, name, shared, scenario),
})

export const make = (bindings: Runtime.Bindings) => (name: string): Declared => ({
  withLayer: (shared) => openShared(bindings, name, shared),
  withScenarioLayer: (scenario) => openScenario(bindings, name, scenario),
})
