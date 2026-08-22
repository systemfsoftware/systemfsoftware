import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import type { Admitted, Refused } from './InterpreterDecide.workflow.js'

export const tracedDecide = (trace: string[], admitted: Admitted) =>
  Workflow.make((): Result.Result<Admitted, Refused> => {
    trace.push('decide')
    return Result.succeed(admitted)
  })
