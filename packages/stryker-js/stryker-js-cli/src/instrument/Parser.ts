/**
 * Parser — the instrumenter's format table: the core js/jsx/ts/tsx parsers
 * (oxc) plus whatever `ParserContribution`s the caller supplies, so a format
 * outside the core rides a plugin package rather than this module.
 *
 * A file whose extension has no parser fails as a named `ParserNotFound`
 * carrying the file and the extension, never a crash.
 */
import type { Program } from 'estree'
import { type OxcError, parseSync } from 'oxc-parser'

import { buildLineTable, positionFromLineTable } from './estree.js'
import { ParseFailed, ParserNotFound } from './Parser.schema.js'
import type { Ast, AstFormat, JSAst, SpannedComment, TSAst, TsxAst } from './Syntax.js'
export { ParseFailed, ParserNotFound }

export interface ParserContribution {
  readonly extensions: readonly string[]
  readonly parse: (input: string, fileName: string) => Ast
}

export type CoreFormat = Extract<AstFormat, 'js' | 'ts' | 'tsx'>

export type ParseFile = (code: string, fileName: string) => Promise<Ast>

const CORE_FORMAT_BY_EXTENSION: Readonly<Record<string, CoreFormat>> = {
  '.js': 'js',
  '.jsx': 'js',
  '.mjs': 'js',
  '.cjs': 'js',
  '.mts': 'ts',
  '.cts': 'ts',
  '.ts': 'ts',
  '.tsx': 'tsx',
}

const extensionOf = (fileName: string): string => {
  const separator = Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\'))
  const dot = fileName.lastIndexOf('.')
  if (dot <= separator) {
    return ''
  }
  return fileName.slice(dot).toLowerCase()
}

export const coreFormatOf = (fileName: string): CoreFormat | undefined =>
  CORE_FORMAT_BY_EXTENSION[extensionOf(fileName)]

function parseWithOxc(
  text: string,
  fileName: string,
  lang: 'js' | 'jsx' | 'ts' | 'tsx',
): { root: Program; comments: readonly SpannedComment[] } {
  const result = parseSync(fileName, text, { lang, range: true })
  const failure = oxcParseFailure(result.errors, text, fileName)
  if (failure !== undefined) {
    throw failure
  }
  // oxc's Program and comments are structurally the estree Program /
  // SpannedComment shapes the rest of this package works with; the boundary
  // casts name that contract once, and the scoped disables stay on those lines.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const program = result.program as unknown as Program
  // oxlint-disable-next-line typescript/no-unnecessary-type-assertion typescript/no-unsafe-type-assertion
  return { root: program, comments: result.comments as readonly SpannedComment[] }
}

function oxcParseFailure(
  errors: readonly OxcError[],
  text: string,
  fileName: string,
): ParseFailed | undefined {
  const first = errors.at(0)
  if (first === undefined) {
    return undefined
  }
  return new ParseFailed({
    fileName,
    message: first.message,
    location: positionFromLineTable(oxcErrorLabelStart(first), buildLineTable(text)),
    cause: errors.map((reported) => reported.message),
  })
}

function oxcErrorLabelStart(error: OxcError): number {
  const label = error.labels.at(0)
  if (label === undefined) {
    return 0
  }
  return label.start
}

function createJSParser(): (text: string, fileName: string) => Promise<JSAst> {
  return async function parse(text: string, fileName: string): Promise<JSAst> {
    const { root, comments } = parseWithOxc(text, fileName, 'js')
    return { originFileName: fileName, rawContent: text, format: 'js', root, comments }
  }
}

export async function parseTS(text: string, fileName: string): Promise<TSAst> {
  const { root, comments } = parseWithOxc(text, fileName, 'ts')
  return { originFileName: fileName, rawContent: text, format: 'ts', root, comments }
}

export async function parseTsx(text: string, fileName: string): Promise<TsxAst> {
  const { root, comments } = parseWithOxc(text, fileName, 'tsx')
  return { root, comments, format: 'tsx', originFileName: fileName, rawContent: text }
}

export type InstrumentParser = ParseFile & {
  readonly knowsFile: (fileName: string) => boolean
}

const parserTable = (
  contributions: readonly ParserContribution[],
  core: Readonly<Record<CoreFormat, ParseFile>>,
): Map<string, ParseFile> => {
  const table = new Map<string, ParseFile>()
  contributions
    .flatMap((contribution) =>
      contribution.extensions.map((extension): readonly [string, ParseFile] => [
        `.${extension.toLowerCase().replace(/^\./, '')}`,
        (code, fileName) => Promise.resolve(contribution.parse(code, fileName)),
      ])
    )
    .forEach(([extension, parse]) => {
      table.set(extension, parse)
    })
  // The core table is registered last, so a contribution can extend the format
  // table but never displaces js/ts/tsx.
  Object.entries(CORE_FORMAT_BY_EXTENSION).forEach(([extension, format]) => {
    table.set(extension, core[format])
  })
  return table
}

export function createParser(contributions: readonly ParserContribution[] = []): InstrumentParser {
  const table = parserTable(contributions, { js: createJSParser(), ts: parseTS, tsx: parseTsx })
  const parse = async (code: string, fileName: string): Promise<Ast> => {
    const parser = table.get(extensionOf(fileName))
    if (parser === undefined) {
      throw new ParserNotFound({ fileName, extension: extensionOf(fileName), cause: undefined })
    }
    return parser(code, fileName)
  }
  return Object.assign(parse, {
    knowsFile: (fileName: string): boolean => table.has(extensionOf(fileName)),
  })
}
