/**
 * Instrument — the instrument capability: Cell description, file/mutant types and the instrument entry point.
 */
import { Cell } from '@systemfsoftware/effect-cell-types'
import { type FileDescription, Mutant as ApiMutant } from '@systemfsoftware/stryker-js/Mutant'
import * as Effect from 'effect/Effect'
import * as Predicate from 'effect/Predicate'
import * as Result from 'effect/Result'

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
} from './Instrument.workflow.js'
import { instrumentWorkflow } from './Instrument.workflow.js'
import { createParser, getFormat } from './Parser.js'
import { print } from './Printer.js'
import { type Ast, AstFormat, type HtmlAst, type ScriptAst, type SvelteAst } from './Syntax.js'
import { createMutantCollector, transform } from './Transformer.js'
import type { TransformerOptions } from './Transformer.js'

// ---- File ----
export interface File extends FileDescription {
  name: string
  content: string
}
export interface InstrumentResult {
  files: readonly File[]
  mutants: readonly ApiMutant[]
}

export type { InstrumenterOptions }
// Mutant identity, application and API mapping live with the mutators — this
// module only orchestrates the pipeline.
import { spanOf } from './estree.js'
import { toApiMutant } from './Mutator.js'
import { type SpannedComment } from './Syntax.js'

// ---- disable-type-checks ----
const commentDirectiveRegEx = /^(\s*)@(ts-[a-z-]+).*$/
const tsDirectiveLikeRegEx = /@(ts-[a-z-]+)/
const startingCommentRegex = /(^\s*\/\*.*?\*\/)/gs

export async function disableTypeChecks(file: File): Promise<File> {
  const format = getFormat(file.name)
  if (!format) {
    return file
  }
  if (isJSFileWithoutTSDirectives(file, format)) {
    return { ...file, content: prefixWithNoCheck(file.content) }
  }
  const parse = createParser()
  const ast = await parse(file.content, file.name)
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
function isJSFileWithoutTSDirectives(file: File, format: AstFormat) {
  return (format === 'ts' || format === 'js') && !tsDirectiveLikeRegEx.test(file.content)
}
function disableTypeCheckingInScript(ast: ScriptAst): string {
  return prefixWithNoCheck(removeTSDirectives(ast.rawContent, ast.comments))
}
function prefixWithNoCheck(code: string): string {
  if (code.startsWith('#')) {
    const newLineIndex = code.indexOf('\n')
    if (newLineIndex > 0) {
      return `${code.substring(0, newLineIndex)}\n// @ts-nocheck\n${code.substring(newLineIndex + 1)}`
    } else {
      return code
    }
  } else {
    startingCommentRegex.lastIndex = 0
    const commentMatch = startingCommentRegex.exec(code)
    const leadingComment = commentMatch?.[1]
    if (leadingComment === undefined) {
      return `// @ts-nocheck\n${code}`
    }
    return `${leadingComment.concat('\n')}// @ts-nocheck\n${code.substring(leadingComment.length)}`
  }
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
function removeTSDirectives(
  text: string,
  comments: readonly SpannedComment[] | null | undefined,
): string {
  if (comments === null || comments === undefined) {
    return text
  }
  const directiveRanges = comments.map(tryParseTSDirective).filter(Predicate.isNotNullish).sort((a, b) =>
    a.startPos - b.startPos
  )
  if (directiveRanges.length === 0) {
    return text
  }
  let currentIndex = 0
  let pruned = ''
  for (const directiveRange of directiveRanges) {
    pruned += text.substring(currentIndex, directiveRange.startPos)
    currentIndex = directiveRange.endPos
  }
  pruned += text.substring(currentIndex)
  return pruned
}
function tryParseTSDirective(
  comment: SpannedComment,
): { startPos: number; endPos: number } | undefined {
  const match = commentDirectiveRegEx.exec(comment.value)
  if (match !== null) {
    const start = comment.start
    if (start === undefined) {
      throw new Error('Comment without start')
    }
    const directivePrefix = match[1]
    if (directivePrefix === undefined) {
      throw new Error('TS directive match without prefix')
    }
    const directiveName = match[2]
    if (directiveName === undefined) {
      throw new Error('TS directive match without directive name')
    }
    const directiveStartPos = start + directivePrefix.length + 2
    return { startPos: directiveStartPos, endPos: directiveStartPos + directiveName.length + 1 }
  }
  return undefined
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
  return typeof value === 'object' && value !== null && 'shouldIgnore' in value &&
    typeof value.shouldIgnore === 'function'
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

function isAst(value: unknown): value is Ast {
  return typeof value === 'object' && value !== null && 'format' in value && 'root' in value
}

type FileSchemaType = typeof FileSchema.Type
const instrumentCell = Cell.layer({
  read: (command: InstrumentCommand) =>
    Effect.gen(function*() {
      const files = command.files
      const options = command.options
      const parse = createParser()
      const asts: Ast[] = []
      for (const { name, content } of files) {
        const ast = yield* Effect.tryPromise({
          try: () => parse(content, name),
          catch: (cause) => new InstrumentError({ message: `Failed to parse ${name}`, cause }),
        })
        asts.push(ast)
      }
      const collector = createMutantCollector()
      const workAsts: readonly Ast[] = asts.filter(isAst)
      for (let i = 0; i < workAsts.length; i++) {
        const ast = workAsts[i]
        const file = files[i]
        if (ast === undefined || file === undefined) {
          continue
        }
        yield* Effect.try({
          try: () =>
            transform(ast, collector, {
              options: toTransformerOptions(options),
              mutateDescription: toOneBasedLineNumber(file.mutate),
            }),
          catch: (cause) => new InstrumentError({ message: `Failed to transform ${file.name}`, cause }),
        })
      }
      const mutants: readonly ApiMutant[] = yield* Effect.try({
        try: () => collector.map(toApiMutant),
        catch: (cause) => new InstrumentError({ message: 'Failed to instrument', cause }),
      })
      return { files, options, asts, mutants }
    }),
  decode: (
    raw: {
      readonly files: readonly FileSchemaType[]
      readonly options: InstrumenterOptions
      readonly asts: readonly Ast[]
      readonly mutants: readonly ApiMutant[]
    },
  ) =>
    Result.succeed(
      InstrumentDecoded.make({ files: raw.files, options: raw.options, asts: raw.asts, mutants: raw.mutants }),
    ),
  decide: instrumentWorkflow,
  encode: (outcome: Result.Result<InstrumentDecision, InstrumentError>) => outcome,
  write: (outcome: Result.Result<InstrumentDecision, InstrumentError>) =>
    Result.match(outcome, {
      onFailure: (error) => Effect.fail(error),
      onSuccess: (decision) =>
        Effect.try({
          try: () => {
            const files = decision.files
            const asts: readonly unknown[] = decision.asts
            const outFiles: FileSchemaType[] = []
            const isAstValue = (value: unknown): value is Ast =>
              typeof value === 'object' && value !== null && 'format' in value && 'root' in value
            for (let i = 0; i < asts.length; i++) {
              const maybeAst: unknown = asts[i]
              const maybeFile: FileSchemaType | undefined = files[i]
              if (maybeAst === undefined || maybeFile === undefined) {
                continue
              }
              if (!isAstValue(maybeAst)) {
                continue
              }
              const ast: Ast = maybeAst
              const file: FileSchemaType = maybeFile
              const mutatedContent = print(ast)
              outFiles.push({ name: file.name, mutate: file.mutate, content: mutatedContent })
            }
            return InstrumentResultSchema.make({ files: outFiles, mutants: decision.mutants })
          },
          catch: (cause) => new InstrumentError({ message: 'Failed to print', cause }),
        }),
    }),
})
export const instrument = (
  files: readonly File[],
  options: InstrumenterOptions,
): Effect.Effect<InstrumentResultSchema, InstrumentError> => {
  const schemaFiles: FileSchemaType[] = files.map((file) => ({
    name: file.name,
    content: file.content,
    mutate: file.mutate,
  }))
  return Cell.run(instrumentCell, InstrumentCommand.make({ files: schemaFiles, options }))
}
