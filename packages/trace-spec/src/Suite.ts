import type { Asserted, Expect, Vitest } from '@effect/vitest'
import { Suite as Runtime } from '@systemfsoftware/effect-spec-runtime'
import { Cause, Effect, type FileSystem, Layer, Random, Schema } from 'effect'
import { dual } from 'effect/Function'
import { type Pipeable, Prototype } from 'effect/Pipeable'
import type * as Scope from 'effect/Scope'
import type * as Arbitrary from 'effect/unstable/arbitrary/Arbitrary'
import * as Contract from './Contract.js'
import { HarnessFailure } from './HarnessFailure.schema.js'
import type { Observation } from './Observation.service.js'
import * as Prop from './Prop.js'
import { StimulusFailure } from './StimulusFailure.schema.js'
import * as TaskAnnounce from './TaskAnnounce.js'

export { StimulusFailure }

export const TypeId = Symbol.for('@systemfsoftware/trace-spec/Suite')
export type TypeId = typeof TypeId

export type CaseFailure = HarnessFailure | StimulusFailure

/**
 * What every case's layers carry around the body: the observation harness and
 * the file system failure dumps are written through. Trace ids draw through
 * the `Random` reference, which the runner salts per case with
 * `Random.withSeed`, so no layer has to provide it.
 */
export type Harness = Observation | FileSystem.FileSystem

export type ArbitraryInput<Input> = Schema.Schema<Input> | Arbitrary.Arbitrary<Input>

export interface CaseRegistrar<Provided> {
  <Input, Output, E>(
    name: string,
    contract: Contract.Contract<Input, Output, E, Provided>,
    input: Input,
  ): void
  prop: <Input, Output, E>(
    name: string,
    contract: Contract.Contract<Input, Output, E, Provided>,
    arbitrary: ArbitraryInput<Input>,
  ) => void
}

export interface CaseTools<Provided> {
  readonly Case: CaseRegistrar<Provided>
}

/**
 * Every stage that can still reach `body` also declares whether its cases stay
 * on the live clock, and a live declaration carries the reason it stayed there
 * (KTD11). Without one, the stage's cases run on the kernel.
 */
export interface LiveStage<Self> {
  readonly live: (reason: string) => Self
}

export interface Opened<Provided> extends LiveStage<Opened<Provided>> {
  readonly body: (use: (tools: CaseTools<Provided>) => void) => void
}

export interface Declared extends Pipeable, LiveStage<Declared> {
  readonly [TypeId]: typeof TypeId
  readonly withLayer: <SharedProvided>(shared: Layer.Layer<SharedProvided | Harness>) => Shared<SharedProvided>
  readonly withScenarioLayer: <Provided>(scenario: Layer.Layer<Provided | Harness>) => Opened<Provided | Harness>
}

export interface Shared<SharedProvided> extends Pipeable, LiveStage<Shared<SharedProvided>> {
  readonly [TypeId]: typeof TypeId
  readonly withScenarioLayer: <Provided>(
    scenario: Layer.Layer<Provided | Harness, never, SharedProvided>,
  ) => Opened<Provided | SharedProvided | Harness>
  readonly body: (use: (tools: CaseTools<SharedProvided | Harness>) => void) => void
}

const isHarnessFailure = Schema.is(HarnessFailure)

const SALT_BYTES = 8

/**
 * Per-case salt for globally unique W3C trace ids: drawn here, at case
 * registration and outside any kernel run, so a seeded Random inside the run
 * never replays another case's ids and the raw crypto source never enters an
 * explored body.
 */
const saltOf = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const caseFailureOf = (stimulus: string, salt: string) => <E>(failure: E | CaseFailure): CaseFailure =>
  isHarnessFailure(failure)
    ? failure
    : new StimulusFailure({ stimulus, detail: `${Cause.pretty(Cause.fail(failure))}\nrandom salt: ${salt}` })

const caseBody = <Input, Output, E, Provided>(
  expect: Expect,
  contract: Contract.Contract<Input, Output, E, Provided>,
  input: Input,
  salt: string,
): Effect.Effect<void, CaseFailure, Asserted | Provided | Harness> =>
  Contract.judge(contract, input).pipe(
    Effect.tap(TaskAnnounce.announceDump),
    Effect.flatMap((judgment) => Contract.verdictCheck(contract, expect, judgment)),
    Effect.mapError(caseFailureOf(contract.stimulus.name, salt)),
  )

const caseTools = <Provided, ScenarioRequired>(
  register: Runtime.RegisterFn<void, CaseFailure, Provided | Harness>,
  propIt: Vitest.MethodsNonLive<never>,
  scenario: Layer.Layer<Contract.Services<Provided>, never, ScenarioRequired>,
  shared: Layer.Layer<ScenarioRequired, never, never>,
): CaseTools<Provided | Harness> => {
  const Case: CaseRegistrar<Provided | Harness> = (name, contract, input) => {
    const salt = saltOf()
    register(name, (expect) => caseBody(expect, contract, input, salt).pipe(Random.withSeed(salt)), 'run')
  }
  Case.prop = <Input, Output, E>(
    name: string,
    contract: Contract.Contract<Input, Output, E, Provided | Harness>,
    arbitrary: ArbitraryInput<Input>,
  ) => {
    const salt = saltOf()
    propIt.effect.prop(
      name,
      { of: [arbitrary], subject: contract.stimulus },
      (subject, values) =>
        Prop.predicate<Input, Output, E, Provided | Harness, ScenarioRequired>(
          name,
          contract,
          scenario,
          shared,
        )(subject, values[0]).pipe(Random.withSeed(salt)),
    )
  }
  return { Case }
}

const config = (name: string, live: Runtime.LiveCase | undefined): Runtime.Config =>
  live === undefined
    ? { name, describe: 'describe', options: undefined }
    : { name, describe: 'describe', options: undefined, live }

const openedScenario = <ROut>(
  bindings: Runtime.Bindings,
  name: string,
  live: Runtime.LiveCase | undefined,
  scenario: Layer.Layer<ROut | Harness>,
): Opened<ROut | Harness> => ({
  live: (reason) => openedScenario(bindings, name, { reason }, scenario),
  body: (use) =>
    Runtime.openCase(
      config(name, live),
      scenario,
      (
        register: Runtime.RegisterFn<void, CaseFailure, ROut | Harness | Scope.Scope>,
        propIt: Vitest.MethodsNonLive<never>,
      ) => use(caseTools<ROut | Harness, never>(register, propIt, scenario, Layer.empty)),
    )(bindings),
})

const openedSharedScenario = <SharedProvided, Provided>(
  bindings: Runtime.Bindings,
  name: string,
  live: Runtime.LiveCase | undefined,
  shared: Layer.Layer<SharedProvided | Harness>,
  scenario: Layer.Layer<Provided | Harness, never, SharedProvided>,
): Opened<Provided | SharedProvided | Harness> => ({
  live: (reason) => openedSharedScenario(bindings, name, { reason }, shared, scenario),
  body: (use) =>
    Runtime.openSharedCase(
      config(name, live),
      { layer: shared },
      scenario,
      (
        register: Runtime.RegisterFn<void, CaseFailure, Provided | SharedProvided | Harness | Scope.Scope>,
        propIt: Vitest.MethodsNonLive<never>,
      ) =>
        use(caseTools<Provided | SharedProvided | Harness, SharedProvided>(
          register,
          propIt,
          scenario.pipe(Layer.provideMerge(shared)),
          shared,
        )),
    )(bindings),
})
const registerSharedCases = <SharedProvided>(
  bindings: Runtime.Bindings,
  name: string,
  live: Runtime.LiveCase | undefined,
  shared: Layer.Layer<SharedProvided | Harness>,
  use: (tools: CaseTools<SharedProvided | Harness>) => void,
): void =>
  Runtime.openShared(
    config(name, live),
    { layer: shared },
    (
      register: Runtime.RegisterFn<void, CaseFailure, SharedProvided | Harness | Scope.Scope>,
      propIt: Vitest.MethodsNonLive<never>,
    ) => use(caseTools<SharedProvided | Harness, never>(register, propIt, shared, shared)),
  )(bindings)

const sharedOver = <SharedProvided>(
  bindings: Runtime.Bindings,
  name: string,
  live: Runtime.LiveCase | undefined,
  shared: Layer.Layer<SharedProvided | Harness>,
): Shared<SharedProvided> => ({
  [TypeId]: TypeId,
  live: (reason) => sharedOver(bindings, name, { reason }, shared),
  withScenarioLayer: (scenario) => openedSharedScenario(bindings, name, live, shared, scenario),
  body: (use) => registerSharedCases(bindings, name, live, shared, use),
  ...Prototype,
})

const declared = (
  bindings: Runtime.Bindings,
  name: string,
  live: Runtime.LiveCase | undefined,
): Declared => ({
  [TypeId]: TypeId,
  live: (reason) => declared(bindings, name, { reason }),
  withLayer: (shared) => sharedOver(bindings, name, live, shared),
  withScenarioLayer: (scenario) => openedScenario(bindings, name, live, scenario),
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

const liveDual = <Self>(self: LiveStage<Self>, reason: string): Self => self.live(reason)

export const live: {
  (reason: string): <Self>(self: LiveStage<Self>) => Self
  <Self>(self: LiveStage<Self>, reason: string): Self
} = dual(2, liveDual)

export const make = (bindings: Runtime.Bindings) => (name: string): Declared => declared(bindings, name, undefined)
