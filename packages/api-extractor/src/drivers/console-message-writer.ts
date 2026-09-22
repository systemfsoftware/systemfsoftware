import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import type { LogLevel } from '../collector/message-router.schema.js'
import { MessageWriter } from '../message-writer.service.js'

/**
 * The write end the console driver emits to. `process.stdout` and
 * `process.stderr` satisfy it; tests bind in-memory sinks.
 */
export interface TextWritable {
  readonly write: (text: string) => void
}

export interface ConsoleMessageWriterOptions {
  readonly stdout?: TextWritable | undefined
  readonly stderr?: TextWritable | undefined
}

const errorStream = (options: ConsoleMessageWriterOptions): TextWritable => options.stderr ?? process.stderr

const outputStream = (options: ConsoleMessageWriterOptions): TextWritable => options.stdout ?? process.stdout

const streamFor = (level: LogLevel, options: ConsoleMessageWriterOptions): TextWritable =>
  level === 'error' ? errorStream(options) : outputStream(options)

/**
 * A MessageWriter whose writes are synchronous console output.
 *
 * The ported Collector emits log lines fire-and-forget from deep inside
 * synchronous analysis code (upstream called `console.log` directly). A
 * Terminal-backed writer is asynchronous under NodeServices, which makes
 * `Effect.runSync` around those emits a defect (AsyncFiberError). The console
 * writer keeps the fire-and-forget call sites lawful: every write is
 * `Effect.sync`, so `runSync` never suspends.
 */
export const layer = (options: ConsoleMessageWriterOptions = {}): Layer.Layer<MessageWriter> =>
  Layer.succeed(MessageWriter, {
    // The router emits already-formatted text; the writer only picks the stream
    // and appends the newline.
    write: (level: LogLevel, text: string) =>
      Effect.sync(() => {
        streamFor(level, options).write(text + '\n')
      }),
  })
