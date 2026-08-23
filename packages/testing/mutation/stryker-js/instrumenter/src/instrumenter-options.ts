import { type ParserOptions } from './parsers/index.js'
import { type TransformerOptions } from './transformers/index.js'

export interface InstrumenterOptions extends ParserOptions, TransformerOptions {}
