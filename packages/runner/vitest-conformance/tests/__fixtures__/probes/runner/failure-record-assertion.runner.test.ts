import { it } from '@systemfsoftware/vitest'

it('Should_ReportAnAssertionError_When_ItsOnlyCheckMismatches', function*({ expect }) {
  yield* expect({ total: 4, status: 'Pending' }).toEqual({ total: 5, status: 'Pending' })
})
