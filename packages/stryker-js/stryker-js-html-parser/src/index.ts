/**
 * The html parser plugin package: one `Parser` contribution for `.html`.
 *
 * The declaration crosses the effect-free ABI as plain data — no Effect, no
 * Layer, no runtime — and the module also exports the contribution array a host
 * reads when it loads this package by module string.
 */
import { declarePlugin } from '@systemfsoftware/stryker-js'
import type { PluginModule } from '@systemfsoftware/stryker-js'

import { makeHtmlParser } from './Parser.js'

export { makeHtmlParser, parseHtml } from './Parser.js'
export type { HtmlParser } from './Parser.js'
export { isParseFailed } from './Syntax.js'
export type {
  HtmlAst,
  HtmlParseResult,
  HtmlRootNode,
  HtmlScript,
  ParseFailed,
  Position,
  Range,
  ScriptFormat,
  SourceLocation,
} from './Syntax.js'

/**
 * The `html` Parser contribution: a document becomes its `<script>` bodies,
 * each with the range, the language and the origin the host parses it from.
 */
export const htmlParser = declarePlugin('Parser', 'html', makeHtmlParser)

/**
 * The contribution set a host reads when it loads this package by module
 * string. Typed against the ABI's own module contract, so a drift in that
 * contract fails this package's typecheck instead of shipping a module the
 * loader cannot describe.
 */
export const strykerPlugins: PluginModule['strykerPlugins'] = [htmlParser]
