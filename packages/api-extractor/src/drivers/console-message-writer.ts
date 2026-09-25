import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'

import type { LogLevel } from '../collector/message-router.schema.js'
import type { TypeScriptCompiler } from '../compiler/typescript-compiler.service.js'
import { MessageWriter } from '../message-writer.service.js'
import { layer as typescriptCompilerLayer } from './typescript-compiler.js'

/** The one method the console driver needs of a stream: a synchronous write of one chunk. */
export interface TextWritable {
  readonly write: (text: string) => void
}

export interface ConsoleMessageWriterOptions {
  readonly stdout?: TextWritable | undefined
  readonly stderr?: TextWritable | undefined
}

const errorStream = (options: ConsoleMessageWriterOptions): TextWritable => options.stderr ?? process.stderr

const outputStream = (options: ConsoleMessageWriterOptions): TextWritable => options.stdout ?? process.stdout

/** Info and verbose lines go to stdout; warnings and errors go to stderr. */
const streamFor = (level: LogLevel, options: ConsoleMessageWriterOptions): TextWritable =>
  Match.value(level).pipe(
    Match.when('error', () => errorStream(options)),
    Match.when('warning', () => errorStream(options)),
    Match.when('info', () => outputStream(options)),
    Match.when('verbose', () => outputStream(options)),
    Match.when('none', () => outputStream(options)),
    Match.exhaustive,
  )

/** The `MessageWriter` console driver, writing synchronously so its channel is `never`. */
export const messageWriterLayer = (options: ConsoleMessageWriterOptions = {}): Layer.Layer<MessageWriter> =>
  Layer.succeed(MessageWriter, {
    write: (level: LogLevel, text: string) =>
      Effect.sync(() => {
        streamFor(level, options).write(text + '\n')
      }),
  })

/** The drivers a run binds: the console writer and the bundled TypeScript compiler. */
export const layer = (options: ConsoleMessageWriterOptions = {}): Layer.Layer<MessageWriter | TypeScriptCompiler> =>
  Layer.mergeAll(messageWriterLayer(options), typescriptCompilerLayer)
