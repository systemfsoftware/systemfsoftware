import { Effect } from 'effect'

import type { MessageWriter } from './message-router.js'

/**
 * A MessageWriter whose writes are synchronous console output.
 *
 * The ported Collector emits log lines fire-and-forget from deep inside
 * synchronous analysis code (upstream called `console.log` directly). A
 * Terminal-backed writer is asynchronous under NodeServices, which makes
 * `Effect.runSync` around those emits a defect (AsyncFiberError). The
 * console writer keeps the fire-and-forget call sites lawful: every write
 * is `Effect.sync`, so `runSync` never suspends.
 */
export const ConsoleMessageWriter: MessageWriter = {
  // The router emits already-formatted text; the writer only picks the stream
  // and appends the newline.
  write: (level, text) =>
    Effect.sync(() => {
      const stream = level === 'error' ? process.stderr : process.stdout
      stream.write(text + '\n')
    }),
}
