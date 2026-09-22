import { Suite as Runtime } from '@systemfsoftware/effect-spec-runtime'
import { Cause, Effect, type FileSystem, type Layer, Schema } from 'effect'
import * as Contract from './Contract.js'
import { ContractDecodeError } from './ContractDecodeError.schema.js'
import { EmptyObservationError } from './EmptyObservationError.schema.js'
import type { Observation } from './Observe.js'
import { StimulusFailure } from './StimulusFailure.schema.js'
import { TraceDisparityError } from './TraceDisparityError.schema.js'

export type CaseFailure = ContractDecodeError | EmptyObservationError | TraceDisparityError | StimulusFailure

export type Harness = Observation | FileSystem.FileSystem

export type CaseRegistrar<Provided> = <Input, Output, E>(
  name: string,
  contract: Contract.Contract<Input, Output, E, Provided>,
  input: Input,
) => void

export interface CaseTools<Provided> {
  readonly Case: CaseRegistrar<Provided>
}

export interface Opened<Provided> {
  readonly body: (use: (tools: CaseTools<Provided>) => void) => void
}

export interface Declared {
  readonly withScenarioLayer: <Provided>(scenario: Layer.Layer<Provided | Harness>) => Opened<Provided | Harness>
}

const isCheckFailure = Schema.is(Schema.Union([ContractDecodeError, EmptyObservationError, TraceDisparityError]))

const caseFailureOf = (stimulus: string) => <E>(failure: E | CaseFailure): CaseFailure =>
  isCheckFailure(failure)
    ? failure
    : new StimulusFailure({ stimulus, detail: Cause.pretty(Cause.fail(failure)) })

const caseBody = <Input, Output, E, Provided>(
  contract: Contract.Contract<Input, Output, E, Provided>,
  input: Input,
): Effect.Effect<void, CaseFailure, Provided | Harness> =>
  Contract.check(contract, input).pipe(Effect.asVoid, Effect.mapError(caseFailureOf(contract.stimulus.name)))

const open = <ROut>(
  bindings: Runtime.Bindings,
  name: string,
  scenario: Layer.Layer<ROut | Harness>,
): Opened<ROut | Harness> => ({
  body: (use) =>
    Runtime.openCase(
      bindings,
      { name, describe: 'describe', options: undefined, liveClock: true },
      scenario,
      (register: Runtime.RegisterFn<void, CaseFailure, ROut | Harness>) =>
        use({ Case: (caseName, contract, input) => register(caseName, caseBody(contract, input), 'run') }),
    ),
})

export const make = (bindings: Runtime.Bindings) => (name: string): Declared => ({
  withScenarioLayer: (scenario) => open(bindings, name, scenario),
})
