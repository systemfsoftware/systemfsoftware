import { Conformance } from '@systemfsoftware/conformance-spec'
import { Data, Match } from 'effect'

export class CheckFailed extends Data.TaggedError('CheckFailed')<{ readonly report: string }> {}

export const passedRuns = <C, R>(report: Conformance.Report<C, R>): number =>
  Match.value(report).pipe(
    Match.tag('Pass', (passed) => passed.histories),
    Match.orElse(() => {
      throw new CheckFailed({ report: Conformance.render(report) })
    }),
  )
