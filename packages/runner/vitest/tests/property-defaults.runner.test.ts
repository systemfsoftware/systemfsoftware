import { it } from '@systemfsoftware/vitest'
import { propertyTestDefaults } from '@systemfsoftware/vitest/property-defaults'
import { Effect, Schema } from 'effect'
import * as Arbitrary from 'effect/Arbitrary'
import { vi } from 'vitest'

const countingProperty = (counter: { calls: number }) => (_value: number) => {
  counter.calls += 1
  return true
}

const numbers = Arbitrary.schema(Schema.Finite)

const restoreFromEnvironment = (): void => Arbitrary.configureGlobal(propertyTestDefaults(process.env))

it('Should_DefaultToOneHundredRuns_When_NoEnvironmentVariableIsSet', function*({ expect }) {
  yield* expect(propertyTestDefaults({})).toEqual({ check: { runs: 100 } })
})

it('Should_UseOneThousandRuns_When_CiIsTrue', function*({ expect }) {
  yield* expect(propertyTestDefaults({ CI: 'true' })).toEqual({ check: { runs: 1000 } })
})

it('Should_UseOneThousandRuns_When_CiIsOne', function*({ expect }) {
  yield* expect(propertyTestDefaults({ CI: '1' })).toEqual({ check: { runs: 1000 } })
})

it('Should_UseOneHundredRuns_When_CiIsFalse', function*({ expect }) {
  yield* expect(propertyTestDefaults({ CI: 'false' })).toEqual({ check: { runs: 100 } })
})

it('Should_UseOneHundredRuns_When_CiIsZero', function*({ expect }) {
  yield* expect(propertyTestDefaults({ CI: '0' })).toEqual({ check: { runs: 100 } })
})

it('Should_UseOneHundredRuns_When_CiIsEmpty', function*({ expect }) {
  yield* expect(propertyTestDefaults({ CI: '' })).toEqual({ check: { runs: 100 } })
})

it('Should_UseOneHundredRuns_When_AgentRunsWithCiSet', function*({ expect }) {
  yield* expect(propertyTestDefaults({ AGENT: 'omp', CI: 'true' })).toEqual({ check: { runs: 100 } })
})

it('Should_UseThirtyRuns_When_StrykerWorkerIsSetEvenInCi', function*({ expect }) {
  yield* expect(propertyTestDefaults({ STRYKER_MUTATOR_WORKER: '1', CI: 'true' })).toEqual({ check: { runs: 30 } })
})

it('Should_RunOneThousandTimes_When_DefaultsAreConfiguredForCi', function*({ expect }) {
  const counter = { calls: 0 }
  try {
    Arbitrary.configureGlobal(propertyTestDefaults({ CI: 'true' }))
    yield* Arbitrary.checkEffect(numbers, countingProperty(counter))
  } finally {
    restoreFromEnvironment()
  }
  yield* expect(counter.calls).toEqual(1000)
})

it('Should_RunSevenTimes_When_ExplicitRunsAreGivenUnderCiDefaults', function*({ expect }) {
  const counter = { calls: 0 }
  try {
    Arbitrary.configureGlobal(propertyTestDefaults({ CI: 'true' }))
    yield* Arbitrary.checkEffect(numbers, countingProperty(counter), { runs: 7 })
  } finally {
    restoreFromEnvironment()
  }
  yield* expect(counter.calls).toEqual(7)
})

it('Should_RunOneHundredTimes_When_DefaultsAreReset', function*({ expect }) {
  const counter = { calls: 0 }
  try {
    Arbitrary.configureGlobal({})
    yield* Arbitrary.checkEffect(numbers, countingProperty(counter))
  } finally {
    restoreFromEnvironment()
  }
  yield* expect(counter.calls).toEqual(100)
})

it('Should_RunOneThousandTimes_When_TheSetupEntryLoadsUnderCi', function*({ expect }) {
  const counter = { calls: 0 }
  try {
    Arbitrary.configureGlobal({})
    vi.stubEnv('CI', 'true')
    vi.stubEnv('AGENT', undefined)
    // Resetting the module registry makes the next import evaluate the entry, so its configureGlobal call runs.
    vi.resetModules()
    yield* Effect.promise(() => import('@systemfsoftware/vitest/property-defaults'))
    yield* Arbitrary.checkEffect(numbers, countingProperty(counter))
  } finally {
    vi.unstubAllEnvs()
    restoreFromEnvironment()
  }
  yield* expect(counter.calls).toEqual(1000)
})
