import { it, PropertyConfig, type PropertySettings } from '@systemfsoftware/vitest'
import { propertyTestDefaults } from '@systemfsoftware/vitest/property-defaults'
import { ConfigProvider, Effect, Option, Schema } from 'effect'
import * as Arbitrary from 'effect/Arbitrary'

const numbers = Arbitrary.schema(Schema.Finite)

const LOCAL: PropertySettings = {
  tier: 'local',
  runs: Option.none(),
  seed: Option.none(),
  replay: Option.none(),
  commit: Option.none(),
}

const settingsUnder = (environment: Readonly<Record<string, string>>) =>
  Effect.service(PropertyConfig).pipe(
    Effect.provide(PropertyConfig.layer),
    Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown(environment)),
  )

// Each check runs under the given defaults, then the defaults the setup entry installed come back.
const runsUnder = (settings: PropertySettings, options?: Arbitrary.CheckOptions) =>
  Effect.gen(function*() {
    const installed = yield* settingsUnder({})
    let calls = 0
    Arbitrary.configureGlobal(propertyTestDefaults(settings))
    yield* Arbitrary.checkEffect(numbers, () => {
      calls += 1
      return true
    }, options).pipe(Effect.ensuring(Effect.sync(() => Arbitrary.configureGlobal(propertyTestDefaults(installed)))))
    return calls
  })

const runsInEnvironment = (environment: Readonly<Record<string, string>>) =>
  Effect.flatMap(settingsUnder(environment), (settings) => runsUnder(settings))

it('Should_RunOneHundredTimes_When_NoEnvironmentVariableIsSet', function*({ expect }) {
  yield* expect(yield* runsInEnvironment({})).toEqual(100)
})

it('Should_RunOneThousandTimes_When_CiIsTrue', function*({ expect }) {
  yield* expect(yield* runsInEnvironment({ CI: 'true' })).toEqual(1000)
})

it('Should_RunOneThousandTimes_When_CiIsOne', function*({ expect }) {
  yield* expect(yield* runsInEnvironment({ CI: '1' })).toEqual(1000)
})

it('Should_RunOneHundredTimes_When_CiIsFalse', function*({ expect }) {
  yield* expect(yield* runsInEnvironment({ CI: 'false' })).toEqual(100)
})

it('Should_RunOneHundredTimes_When_CiIsZero', function*({ expect }) {
  yield* expect(yield* runsInEnvironment({ CI: '0' })).toEqual(100)
})

it('Should_RunOneHundredTimes_When_CiIsEmpty', function*({ expect }) {
  yield* expect(yield* runsInEnvironment({ CI: '' })).toEqual(100)
})

it('Should_RunOneHundredTimes_When_AnAgentRunsWithCiSet', function*({ expect }) {
  yield* expect(yield* runsInEnvironment({ AGENT: 'coding-agent', CI: 'true' })).toEqual(100)
})

it('Should_RunThirtyTimes_When_StrykerWorkerRunsInCi', function*({ expect }) {
  yield* expect(yield* runsInEnvironment({ STRYKER_MUTATOR_WORKER: '1', CI: 'true' })).toEqual(30)
})

it('Should_RunSevenTimes_When_PropertyRunsIsSevenInCi', function*({ expect }) {
  yield* expect(yield* runsInEnvironment({ PROPERTY_RUNS: '7', CI: 'true' })).toEqual(7)
})

it('Should_RunSevenTimes_When_CheckAsksForSevenUnderCiDefaults', function*({ expect }) {
  yield* expect(yield* runsUnder({ ...LOCAL, tier: 'ci' }, { runs: 7 })).toEqual(7)
})
