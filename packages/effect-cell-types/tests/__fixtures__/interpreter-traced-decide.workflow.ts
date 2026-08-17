import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import type { Admitted, Refused } from './interpreter-decide.workflow.js'

export const tracedDecide = (trace: string[]) =>
  Workflow.make((): Result.Result<Admitted, Refused> => {
    trace.push('decide')
    return Result.succeed({ kind: 'Admitted', length: 0 })
  })
