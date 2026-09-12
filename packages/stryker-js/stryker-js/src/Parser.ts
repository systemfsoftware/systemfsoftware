export { ParserPayloadSchema } from './Parser.schema.js'
export type { ParserPayload } from './Parser.schema.js'

import type { PluginInit, StrykerOptions } from './Options.js'

export interface Parser {
  readonly extensions: readonly string[]
  readonly parse: (input: string, fileName: string) => unknown
}

export type ParserFactory = (options: StrykerOptions, init: PluginInit) => Parser
