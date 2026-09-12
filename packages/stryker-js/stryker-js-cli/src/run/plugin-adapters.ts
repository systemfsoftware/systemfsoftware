/**
 * Host-side adapters from the ABI's plain plugin factories to the shapes the
 * engine and the instrumenter consume internally.
 *
 * The ABI hands a contribution's `make` as a plain factory taking `(options,
 * init)`; the engine's internals want an ignorer function for the instrumenter
 * and parser contributions for its format table. The adapters live here so the
 * instrumenter and the engine never see an ABI factory directly.
 */
import type { Ignorer } from '@systemfsoftware/stryker-js/Ignorer'
import type { PluginInit, StrykerOptions } from '@systemfsoftware/stryker-js/Options'
import type { Parser } from '@systemfsoftware/stryker-js/Parser'
import type { AnyPluginContribution, PluginContribution } from '@systemfsoftware/stryker-js/Plugin'

import { ParseFailed } from '../instrument/Parser.js'
import type { ParserContribution } from '../instrument/Parser.js'
import { type Ast, isAst } from '../instrument/Syntax.js'
import type { InstrumentIgnorer } from '../instrument/Transformer.js'

const NO_INIT: PluginInit = {}

export const isKind =
  <K extends AnyPluginContribution['kind']>(kind: K) =>
  (contribution: AnyPluginContribution): contribution is PluginContribution<K> => contribution.kind === kind

/** An ignorer contribution, bound to the run's options and the instrumenter's contract. */
export const ignorerOf = (contribution: PluginContribution<'Ignorer'>, options: StrykerOptions): InstrumentIgnorer => {
  const ignorer: Ignorer = contribution.make(options, NO_INIT)
  return (node, fileName) => ignorer(node, { fileName, options })
}

const asParserContribution = (parser: Parser): ParserContribution => ({
  extensions: parser.extensions,
  parse: (input: string, fileName: string): Ast => {
    const parsed = parser.parse(input, fileName)
    if (!isAst(parsed)) {
      throw new ParseFailed({
        fileName,
        message: 'the registered parser returned no AST',
        location: { line: 0, column: 0 },
        cause: parsed,
      })
    }
    return parsed
  },
})

/** Every loaded parser contribution, as the instrumenter's format table input. */
export const parserContributionsOf = (
  contributions: readonly PluginContribution<'Parser'>[],
  options: StrykerOptions,
): readonly ParserContribution[] =>
  contributions.map((contribution) => asParserContribution(contribution.make(options, NO_INIT)))
