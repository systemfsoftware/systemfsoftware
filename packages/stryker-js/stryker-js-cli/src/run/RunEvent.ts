import type * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import type * as Queue from 'effect/Queue'

import type { RunEvent } from './RunEvent.schema.js'

export * from './RunEvent.schema.js'

export class RunEvents extends Context.Service<RunEvents, Queue.Queue<RunEvent, Cause.Done>>()(
  '@systemfsoftware/stryker-js-cli/run/RunEvents',
) {}
