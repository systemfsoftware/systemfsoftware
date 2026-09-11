/**
 * The svelte format plugin: one Parser contribution, `svelte`, for `.svelte`
 * components. The compiler it parses with is the project's own — this package
 * declares none, and resolves it from the project at run time.
 */
import type { ParserFactory } from '@systemfsoftware/stryker-js/Parser'
import { declarePlugin } from '@systemfsoftware/stryker-js/Plugin'

import { makeSvelteParser, SVELTE_EXTENSION, type SvelteParser, type SvelteParserOptions } from './Parser.js'

const makeSveltePluginParser: ParserFactory = () => makeSvelteParser()

export const svelteParser = declarePlugin('Parser', 'svelte', makeSveltePluginParser)

/** The contribution list the loader's module schema reads. */
export const strykerPlugins = [svelteParser]

export { makeSvelteParser, SVELTE_EXTENSION }
export type { SvelteParser, SvelteParserOptions }
export type {
  SvelteCompilerNotFound,
  SvelteParseFailed,
  SvelteParserFailure,
  SvelteVersionNotSupported,
  SvelteWalkerNotFound,
} from './Failure.js'
export type { Range, ScriptFormat, SvelteAst, SvelteRootNode, TemplateScript } from './Syntax.js'
