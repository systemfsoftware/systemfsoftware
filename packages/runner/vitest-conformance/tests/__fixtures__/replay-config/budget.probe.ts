import type {} from '@systemfsoftware/vitest'
import { expect, inject, it } from 'vitest'

// The budget the run provided, reported as the failure message so the run's output carries it.
it('Should_ReportTheBudget_When_Run', () => {
  expect.fail(`BUDGET ${JSON.stringify(inject('@systemfsoftware/vitest:property-check'))}`)
})
