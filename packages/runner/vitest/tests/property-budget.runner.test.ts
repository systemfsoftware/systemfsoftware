import { it, propertyCheck, vi } from '@systemfsoftware/vitest'

const KEY = '@systemfsoftware/vitest:property-check'
const NO_COMMIT = (): string => {
  throw new Error('the commit is read only on the CI tier')
}

it('Should_RunOneHundredTimesWithNoSeed_When_RunLocally', function*({ expect }) {
  yield* expect(propertyCheck({ env: () => ({}), commit: NO_COMMIT })).toEqual({ [KEY]: { runs: 100 } })
})

it('Should_RunOneHundredTimesWithNoSeed_When_AnAgentRunsUnderCi', function*({ expect }) {
  yield* expect(propertyCheck({ env: () => ({ CI: 'true', AGENT: '1' }), commit: NO_COMMIT })).toEqual({
    [KEY]: { runs: 100 },
  })
})

it('Should_RunOneThousandTimesSeededFromTheCommit_When_RunOnCi', function*({ expect }) {
  yield* expect(propertyCheck({ env: () => ({ CI: 'true' }), commit: () => 'deadbeefcafe0123' })).toEqual({
    [KEY]: { runs: 1000, record: false, seed: 0xdeadbeef },
  })
})

it('Should_UseSeedOne_When_TheCommitsLeadingDigitsAreZero', function*({ expect }) {
  yield* expect(propertyCheck({ env: () => ({ CI: '1' }), commit: () => '00000000abcdef' })).toEqual({
    [KEY]: { runs: 1000, record: false, seed: 1 },
  })
})

it('Should_RunTheMutationTierSeededFromTheCommit_When_InsideAStrykerWorker', function*({ expect }) {
  yield* expect(
    propertyCheck({
      env: () => ({ CI: 'true', STRYKER_MUTATOR_WORKER: '1' }),
      commit: () => 'deadbeefcafe0123',
    }),
  ).toEqual({ [KEY]: { runs: 30, record: false, seed: 0xdeadbeef } })
})

it('Should_SeedFromTheCheckedOutCommit_When_TheProcessRunsOnCi', function*({ expect }) {
  vi.stubEnv('CI', 'true')
  const { [KEY]: budget } = propertyCheck()
  vi.unstubAllEnvs()
  yield* expect(budget).toMatchObject({ runs: 1000, record: false, seed: expect.any(Number) })
})
