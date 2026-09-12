import { type FileDescription, Mutant as ApiMutant } from '@systemfsoftware/stryker-js/Mutant'
import * as Effect from 'effect/Effect'
import * as Predicate from 'effect/Predicate'

import type { IgnorerService } from '@systemfsoftware/stryker-js/Ignorer'
import type { MutateDescription } from '@systemfsoftware/stryker-js/Mutant'
import {
  FileSchema,
  InstrumentCommand,
  InstrumentDecision,
  InstrumentDecoded,
  type InstrumenterOptions,
  InstrumentError,
  InstrumentResult as InstrumentResultSchema,
} from './Instrument.schema.js'
import { createParser, getFormat } from './Parser.js'
import { print } from './Printer.js'
import { type Ast, AstFormat, type HtmlAst, type ScriptAst, type SvelteAst } from './Syntax.js'
import { createMutantCollector, transform } from './Transformer.js'
import type { TransformerOptions } from './Transformer.js'

export interface File extends FileDescription {
  name: string
  content: string
}
export interface InstrumentResult {
  files: readonly File[]
  mutants: readonly ApiMutant[]
}

export type { InstrumenterOptions }

import { spanOf } from './estree.js'
import { toApiMutant } from './Mutator.js'
import { type SpannedComment } from './Syntax.js'

const commentDirectiveRegEx = /^(\s*)@(ts-[a-z-]+).*$/
const tsDirectiveLikeRegEx = /@(ts-[a-z-]+)/
const STARTING_COMMENT = /^\s*\/\*[\s\S]*?\*\//

export async function disableTypeChecks(file: File): Promise<File> {
  const format = getFormat(file.name)
  if (format === undefined) return file
  return disableTypeChecksFor(file, format)
}

async function disableTypeChecksFor(file: File, format: AstFormat): Promise<File> {
  if (isJSFileWithoutTSDirectives(file, format)) {
    return { ...file, content: prefixWithNoCheck(file.content) }
  }
  const parse = createParser()
  const ast = await parse(file.content, file.name)
  return withDisabledTypeChecking(file, ast)
}

function withDisabledTypeChecking(file: File, ast: Ast): File {
  switch (ast.format) {
    case 'js':
    case 'ts':
    case 'tsx':
      return { ...file, content: disableTypeCheckingInScript(ast) }
    case 'html':
      return { ...file, content: disableTypeCheckingInHtml(ast) }
    case 'svelte':
      return { ...file, content: disableTypeCheckingInSvelte(ast) }
  }
}

const JS_OR_TS_FORMATS: ReadonlySet<AstFormat> = new Set(['js', 'ts'])

function isJSFileWithoutTSDirectives(file: File, format: AstFormat): boolean {
  return JS_OR_TS_FORMATS.has(format) && !tsDirectiveLikeRegEx.test(file.content)
}
function disableTypeCheckingInScript(ast: ScriptAst): string {
  return prefixWithNoCheck(removeTSDirectives(ast.rawContent, ast.comments))
}
function prefixWithNoCheck(code: string): string {
  if (code.startsWith('#')) return afterHashbang(code)
  return afterLeadingComment(code)
}

function afterHashbang(code: string): string {
  const newLineIndex = code.indexOf('\n')
  if (newLineIndex <= 0) return code
  return `${code.substring(0, newLineIndex)}\n// @ts-nocheck\n${code.substring(newLineIndex + 1)}`
}

function afterLeadingComment(code: string): string {
  const leadingComment = leadingCommentOf(code)
  if (leadingComment === undefined) return `// @ts-nocheck\n${code}`
  return `${leadingComment.concat('\n')}// @ts-nocheck\n${code.substring(leadingComment.length)}`
}

function leadingCommentOf(code: string): string | undefined {
  return STARTING_COMMENT.exec(code)?.[0]
}
function getScriptStart(script: HtmlAst['root']['scripts'][number]): number {
  const span = spanOf(script.root)
  if (span === undefined) {
    throw new Error('Script AST root without start')
  }
  return span.start
}

function getScriptEnd(script: HtmlAst['root']['scripts'][number]): number {
  const span = spanOf(script.root)
  if (span === undefined) {
    throw new Error('Script AST root without end')
  }
  return span.end
}
function disableTypeCheckingInHtml(ast: HtmlAst): string {
  const sortedScripts = [...ast.root.scripts].sort((a, b) => getScriptStart(a) - getScriptStart(b))
  let currentIndex = 0
  let html = ''
  for (const script of sortedScripts) {
    html += ast.rawContent.substring(currentIndex, getScriptStart(script))
    html += '\n'
    html += prefixWithNoCheck(removeTSDirectives(script.rawContent, script.comments))
    html += '\n'
    currentIndex = getScriptEnd(script)
  }
  html += ast.rawContent.substring(currentIndex)
  return html
}
function disableTypeCheckingInSvelte(ast: SvelteAst): string {
  const sortedScripts = [ast.root.moduleScript, ...ast.root.additionalScripts].filter(Predicate.isNotNullish).sort((
    a,
    b,
  ) => a.range.start - b.range.start)
  let currentIndex = 0
  let html = ''
  for (const script of sortedScripts) {
    html += ast.rawContent.substring(currentIndex, script.range.start)
    html += '\n'
    html += prefixWithNoCheck(removeTSDirectives(script.ast.rawContent, script.ast.comments))
    html += '\n'
    currentIndex = script.range.end
  }
  html += ast.rawContent.substring(currentIndex)
  return html
}
interface DirectiveRange {
  readonly startPos: number
  readonly endPos: number
}

function removeTSDirectives(
  text: string,
  comments: readonly SpannedComment[] | null | undefined,
): string {
  return removeRanges(text, directiveRanges(comments))
}

function directiveRanges(comments: readonly SpannedComment[] | null | undefined): readonly DirectiveRange[] {
  return (comments ?? [])
    .map(tryParseTSDirective)
    .filter(Predicate.isNotNullish)
    .sort((a, b) => a.startPos - b.startPos)
}

function removeRanges(text: string, ranges: readonly DirectiveRange[]): string {
  const remaining = ranges.reduce(
    (state, range) => ({
      pruned: state.pruned + text.substring(state.cursor, range.startPos),
      cursor: range.endPos,
    }),
    { pruned: '', cursor: 0 },
  )
  return remaining.pruned + text.substring(remaining.cursor)
}

function tryParseTSDirective(comment: SpannedComment): DirectiveRange | undefined {
  const match = commentDirectiveRegEx.exec(comment.value)
  if (match === null) return undefined
  const directivePrefix = requirePart(match[1], 'TS directive match without prefix')
  const directiveName = requirePart(match[2], 'TS directive match without directive name')
  const startPos = comment.start + directivePrefix.length + 2
  return { startPos, endPos: startPos + directiveName.length + 1 }
}

function requirePart(part: string | undefined, message: string): string {
  if (part === undefined) throw new Error(message)
  return part
}
function toOneBasedLineNumber(range: MutateDescription): MutateDescription {
  if (typeof range === 'boolean') {
    return range
  }
  return range.map(({ start, end }) => ({
    start: { column: start.column, line: start.line + 1 },
    end: { column: end.column, line: end.line + 1 },
  }))
}

function isIgnorerService(value: unknown): value is IgnorerService {
  return Predicate.isObject(value) && typeof value['shouldIgnore'] === 'function'
}

function toTransformerOptions(options: InstrumenterOptions): TransformerOptions {
  const base: TransformerOptions = {
    excludedMutations: [...options.excludedMutations],
    ignorers: options.ignorers.filter(isIgnorerService),
  }
  if (options.noHeader !== undefined) {
    return { ...base, noHeader: options.noHeader }
  }
  return base
}

const AST_SHAPE = ['format', 'root'] as const

function isAst(value: unknown): value is Ast {
  return Predicate.isObject(value) && AST_SHAPE.every((key) => key in value)
}

type FileSchemaType = typeof FileSchema.Type

interface ParsedFile {
  readonly file: FileSchemaType
  readonly ast: Ast
}

interface Collected {
  readonly files: readonly FileSchemaType[]
  readonly options: InstrumenterOptions
  readonly asts: readonly Ast[]
  readonly mutants: readonly ApiMutant[]
}

const readCollected = (command: InstrumentCommand): Effect.Effect<Collected, InstrumentError> =>
  Effect.gen(function*() {
    const { files, options } = command
    const parse = createParser()
    const parsed = yield* Effect.forEach(files, (file) =>
      Effect.map(
        Effect.tryPromise({
          try: () => parse(file.content, file.name),
          catch: (cause) => new InstrumentError({ message: `Failed to parse ${file.name}`, cause }),
        }),
        (ast): ParsedFile => ({ file, ast }),
      ))
    const collector = createMutantCollector()
    yield* Effect.forEach(parsed, ({ file, ast }) =>
      Effect.tryPromise({
        try: () =>
          transform(ast, collector, {
            options: toTransformerOptions(options),
            mutateDescription: toOneBasedLineNumber(file.mutate),
          }),
        catch: (cause) => new InstrumentError({ message: `Failed to transform ${file.name}`, cause }),
      }))
    const mutants: readonly ApiMutant[] = yield* Effect.try({
      try: () => collector.map(toApiMutant),
      catch: (cause) => new InstrumentError({ message: 'Failed to instrument', cause }),
    })
    return { files, options, asts: parsed.map(({ ast }) => ast), mutants }
  })

const printDecision = (
  decision: InstrumentDecision,
): Effect.Effect<InstrumentResultSchema, InstrumentError> =>
  Effect.try({
    try: () =>
      InstrumentResultSchema.make({
        files: decision.files.flatMap((file, index) => printedFile(file, decision.asts[index])),
        mutants: decision.mutants,
      }),
    catch: (cause) => new InstrumentError({ message: 'Failed to print', cause }),
  })

function printedFile(file: FileSchemaType, ast: unknown): readonly FileSchemaType[] {
  if (!isAst(ast)) return []
  return [{ name: file.name, mutate: file.mutate, content: print(ast) }]
}

export const decideInstrument = (decoded: InstrumentDecoded): InstrumentDecision =>
  InstrumentDecision.make({
    files: decoded.files,
    mutants: decoded.mutants,
    asts: decoded.asts,
  })

export const instrument = (
  files: readonly File[],
  options: InstrumenterOptions,
): Effect.Effect<InstrumentResultSchema, InstrumentError> =>
  Effect.gen(function*() {
    const schemaFiles: FileSchemaType[] = files.map((file) => ({
      name: file.name,
      content: file.content,
      mutate: file.mutate,
    }))
    const collected = yield* readCollected(InstrumentCommand.make({ files: schemaFiles, options }))
    const decision = decideInstrument(
      InstrumentDecoded.make({
        files: collected.files,
        options: collected.options,
        asts: collected.asts,
        mutants: collected.mutants,
      }),
    )
    return yield* printDecision(decision)
  })
