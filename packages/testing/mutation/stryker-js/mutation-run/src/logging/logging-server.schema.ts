import * as S from 'effect/Schema'

import { ExitClass } from '../exit-classification.js'

/**
 * The logging server bound, but not to a TCP port.
 *
 * `net.Server.address()` answers a string for a Unix-domain socket and `null`
 * before the socket is bound. Neither is reachable through the one call site —
 * it listens without a path and only asks after `listening` fires — so this is
 * the environment contradicting itself rather than a case a caller chooses
 * between.
 *
 * It is a declared variant anyway, because the alternative in this file's
 * history was `throw new Error` inside an `Effect.sync`. That produces a defect
 * carrying a hand-built message, which the run reports as an internal fault
 * with no tag to match on. A tag costs one class and makes the impossible case
 * legible if it ever happens.
 */
export class LoggingServerNotTcpError extends S.TaggedError<LoggingServerNotTcpError>()(
  'LoggingServerNotTcpError',
  {
    address: S.Unknown,
  },
) {
  readonly exitClass = ExitClass.InternalError
}
