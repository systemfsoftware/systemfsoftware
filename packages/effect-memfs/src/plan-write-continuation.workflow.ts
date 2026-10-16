import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match } from 'effect'
import * as Result from 'effect/Result'
import {
  WriteAllChunk,
  WriteAllChunkDecision,
  WriteContinued,
  WriteDrained,
  WriteZero,
} from './plan-write-continuation.schema.js'

export const planWriteContinuation = Workflow.make({
  command: WriteAllChunk,
  decision: WriteAllChunkDecision,
  error: WriteZero,
  decide: (command): Result.Result<WriteAllChunkDecision, WriteZero> =>
    Match.value(command.written === 0).pipe(
      Match.when(true, () =>
        Result.fail(
          new WriteZero({ fd: command.fd, message: `The write to file descriptor ${command.fd} made no progress` }),
        )),
      Match.when(false, () =>
        Match.value(command.written < command.remaining).pipe(
          Match.when(true, () => Result.succeed(new WriteContinued({ skip: command.written }))),
          Match.when(false, () => Result.succeed(new WriteDrained())),
          Match.exhaustive,
        )),
      Match.exhaustive,
    ),
})
