import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import {
  ClassifyGzipFailure,
  DamagedGzipStream,
  GzipFailureDecision,
  NotGzipHeader,
} from './classify-gzip-failure.schema.js'

const fflateInvalidHeaderCode = 6

export const classifyGzipFailure = Workflow.make({
  command: ClassifyGzipFailure,
  decision: GzipFailureDecision,
  error: Schema.Never,
  decide: (command): Result.Result<GzipFailureDecision, never> =>
    Result.succeed(
      Match.value(command.code === fflateInvalidHeaderCode).pipe(
        Match.when(true, () => new NotGzipHeader({})),
        Match.when(false, () => new DamagedGzipStream({})),
        Match.exhaustive,
      ),
    ),
})
