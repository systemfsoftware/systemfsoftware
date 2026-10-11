import { it } from '@systemfsoftware/vitest'
import { Result, Schema } from 'effect'
import { AdmitProcedureDepth, admitProcedureDepth } from '../admit-procedure-depth.workflow.js'

const verdictOf = (subject: typeof admitProcedureDepth, depth: number, limit: number): string =>
  Result.match(subject(new AdmitProcedureDepth({ depth, limit })), {
    onSuccess: () => 'admitted',
    onFailure: () => 'refused',
  })

it.prop(
  '∀c_Depth_=BelowLimitWins',
  {
    of: [
      Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
      Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1))),
    ],
    subject: admitProcedureDepth,
  },
  (subject, [depth, limit]) => verdictOf(subject, depth, limit) === (depth < limit ? 'admitted' : 'refused'),
)
