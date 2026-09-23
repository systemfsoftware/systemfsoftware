import type { TypeScriptCompiler } from '../compiler/typescript-compiler.service.js'
import type { LogLevel } from '../collector/message-router.schema.js'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { MessageWriter } from '../message-writer.service.js'
import { layer as typescriptCompilerLayer } from './typescript-compiler.js'

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

export const messageWriterLayer = (options: ConsoleMessageWriterOptions = {}): Layer.Layer<MessageWriter> =>
  Layer.succeed(MessageWriter, {
    write: (level: LogLevel, text: string) =>
      Effect.sync(() => {
        streamFor(level, options).write(text + '\n')
      }),
  })

export const layer = (options: ConsoleMessageWriterOptions = {}): Layer.Layer<MessageWriter | TypeScriptCompiler> =>
  Layer.mergeAll(messageWriterLayer(options), typescriptCompilerLayer)
