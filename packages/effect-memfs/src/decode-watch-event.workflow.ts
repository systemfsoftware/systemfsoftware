import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import {
  DriverWatchEvent,
  WatchCreate,
  WatchEventDecision,
  WatchRemove,
  WatchUpdate,
} from './decode-watch-event.schema.js'

export const decodeWatchEvent = Workflow.make({
  command: DriverWatchEvent,
  decision: WatchEventDecision,
  error: Schema.Never,
  decide: (command): Result.Result<WatchEventDecision, never> =>
    Match.value(command.eventType).pipe(
      Match.when('rename', () =>
        Match.value(command.exists).pipe(
          Match.when(true, () => Result.succeed(new WatchCreate({ path: command.filename }))),
          Match.when(false, () => Result.succeed(new WatchRemove({ path: command.filename }))),
          Match.exhaustive,
        )),
      Match.when('change', () => Result.succeed(new WatchUpdate({ path: command.filename }))),
      Match.exhaustive,
    ),
})
