import { it } from '@systemfsoftware/vitest'
import { Effect } from 'effect'
import { baselineFailure } from './__fixtures__/failure-corpus/baseline-failure.js'
import { raisedInUserCode } from './__fixtures__/failure-corpus/raised-in-user-code.js'
import { type CorpusFixture, FIRST_LOCATION, recordOf } from './__fixtures__/failure-corpus/record.js'
import { seededSchedule } from './__fixtures__/failure-corpus/seeded-schedule.js'

const verdictOf = (fixture: CorpusFixture, record: string): Record<string, boolean | string | undefined> => {
  const first = FIRST_LOCATION.exec(record)?.[0]
  return {
    fixture: fixture.name,
    defectFile: fixture.defectFile,
    namesDefectFile: record.includes(fixture.defectFile),
    expectedFirstLocationFile: fixture.raisingFile,
    foundFirstLocationFile: first === undefined ? undefined : first.replace(/:\d+$/u, ''),
    foundFirstLocation: first,
    hasSeed: /\bseed=\d+/u.test(record),
    hasPath: /\bpath=\d+(?:,\d+)*/u.test(record),
  }
}

it('Should_NameEachDefectFileFirst_When_TheCorpusRuns', function*({ expect }) {
  const raised = yield* Effect.promise(() => recordOf(raisedInUserCode))
  const seeded = yield* Effect.promise(() => recordOf(seededSchedule))
  const baseline = yield* Effect.promise(() => recordOf(baselineFailure))
  yield* expect({
    raised: verdictOf(raisedInUserCode, raised),
    seeded: verdictOf(seededSchedule, seeded),
    baseline: verdictOf(baselineFailure, baseline),
  }).toMatchObject({
    raised: {
      fixture: raisedInUserCode.name,
      defectFile: raisedInUserCode.defectFile,
      namesDefectFile: true,
      foundFirstLocationFile: raisedInUserCode.raisingFile,
      hasSeed: false,
      hasPath: false,
    },
    seeded: {
      fixture: seededSchedule.name,
      defectFile: seededSchedule.defectFile,
      namesDefectFile: true,
      foundFirstLocationFile: seededSchedule.raisingFile,
      hasSeed: true,
      hasPath: true,
    },
    baseline: {
      fixture: baselineFailure.name,
      defectFile: baselineFailure.defectFile,
      namesDefectFile: true,
      foundFirstLocationFile: baselineFailure.raisingFile,
      hasSeed: false,
      hasPath: false,
    },
  })
})
