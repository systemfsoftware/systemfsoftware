/**
 * Parser — all parsers that turn source text into the instrumenter's ASTs.
 */
import type { Ast as NGAst, ParseTreeResult } from 'angular-html-parser'
import * as Match from 'effect/Match'
import * as Predicate from 'effect/Predicate'
import type { BaseNode, Program } from 'estree'
import { type OxcError, parseSync } from 'oxc-parser'
import path from 'path'
import { buildLineTable, positionFromLineTable } from './estree.js'
import {
  ParseFailed,
  ParserNotFound,
  SvelteParseFailed,
  SvelteVersionNotSupported,
  SvelteWalkerNotFound,
} from './Parser.schema.js'
import { type SpannedComment } from './Syntax.js'
import {
  type Ast,
  type AstByFormat,
  type AstFormat,
  computeLineStarts,
  type HtmlAst,
  type HtmlRootNode,
  type JSAst,
  positionFromOffset,
  type Range,
  type ScriptAst,
  type ScriptFormat,
  type SvelteAst,
  type SvelteRootNode,
  type TemplateScript,
  type TSAst,
  type TsxAst,
} from './Syntax.js'
export { ParseFailed, ParserNotFound, SvelteParseFailed, SvelteVersionNotSupported, SvelteWalkerNotFound }

export interface ParserOptions {}

export interface ParserContext {
  parse<T extends AstFormat>(
    code: string,
    fileName: string,
    formatOverride?: T,
  ): Promise<AstByFormat[T]>
}

export type Parser<T extends Ast = Ast> = (
  text: string,
  fileName: string,
  context: ParserContext,
) => Promise<T>
// ---------------------------------------------------------------------------
// Unknown-value narrowing
// ---------------------------------------------------------------------------

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isTagged(value: unknown, type: string): value is Record<string, unknown> {
  return isPlainRecord(value) && value['type'] === type
}

function hasNumericRange(value: Record<string, unknown>): value is Record<string, unknown> & Range {
  return typeof value['start'] === 'number' && typeof value['end'] === 'number'
}

function isRange(value: unknown): value is Range {
  return isPlainRecord(value) && hasNumericRange(value)
}

function isTypedRecord(value: unknown): value is Record<string, unknown> & { type: string } {
  return isPlainRecord(value) && Predicate.isString(value['type'])
}

function isRangedBaseNode(value: unknown): value is BaseNode & Range {
  return isTypedRecord(value) && hasNumericRange(value)
}

function isNonEmptyArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0
}

function hasField(value: unknown, key: string): value is Record<string, unknown> {
  return isPlainRecord(value) && key in value
}

function hasContent(value: unknown): value is Record<string, unknown> {
  return hasField(value, 'content')
}

function hasHtml(value: unknown): value is Record<string, unknown> {
  return hasField(value, 'html')
}

function fieldOf(value: unknown, key: string): unknown {
  return Match.value(value).pipe(
    Match.when(isPlainRecord, (record) => record[key]),
    Match.orElse(() => undefined),
  )
}

function appendIfDefined<T>(values: T[], value: T | undefined): void {
  if (value !== undefined) {
    values.push(value)
  }
}
// ---------------------------------------------------------------------------
// Oxc parse — one engine for js, ts and tsx.
// ---------------------------------------------------------------------------

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

/**
 * Shifts a parsed script's root span by the offset of the script tag inside
 * the embedding document (html/svelte), so range math against the raw
 * document stays consistent. Child nodes keep their script-relative offsets —
 * mutant positions are re-mapped through the AST's `offset` field.
 */
function shiftScriptOffsets(ast: Ast, offset: number): void {
  const root: unknown = ast.root
  if (isRange(root)) {
    root.start += offset
    root.end += offset
  }
}
// ---------------------------------------------------------------------------
// Top-level dispatcher
// ---------------------------------------------------------------------------

export function createParser(): {
  <T extends AstFormat>(
    code: string,
    fileName: string,
    formatOverride: T,
  ): Promise<AstByFormat[T]>
  (code: string, fileName: string, formatOverride?: AstFormat): Promise<Ast>
} {
  const jsParse = createJSParser()

  async function parse<T extends AstFormat>(
    code: string,
    fileName: string,
    formatOverride: T,
  ): Promise<AstByFormat[T]>
  async function parse(
    code: string,
    fileName: string,
    formatOverride?: AstFormat,
  ): Promise<Ast>
  async function parse(
    code: string,
    fileName: string,
    formatOverride?: AstFormat,
  ): Promise<Ast> {
    const format = getFormat(fileName, formatOverride)
    if (!format) {
      const ext = path.extname(fileName).toLowerCase()
      throw new ParserNotFound({ fileName, extension: ext, cause: undefined })
    }
    return Match.value(format).pipe(
      Match.when('js', () => jsParse(code, fileName)),
      Match.when('tsx', () => parseTsx(code, fileName)),
      Match.when('ts', () => parseTS(code, fileName)),
      Match.when('html', () => parseHtml(code, fileName, { parse })),
      Match.when('svelte', () => parseSvelte(code, fileName, { parse })),
      Match.exhaustive,
    )
  }

  return parse
}

const FORMAT_BY_EXTENSION: Readonly<Record<string, AstFormat>> = {
  '.js': 'js',
  '.jsx': 'js',
  '.mjs': 'js',
  '.cjs': 'js',
  '.mts': 'ts',
  '.cts': 'ts',
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.vue': 'html',
  '.html': 'html',
  '.htm': 'html',
  '.svelte': 'svelte',
}

export function getFormat(
  fileName: string,
  override?: AstFormat,
): AstFormat | undefined {
  return override ?? FORMAT_BY_EXTENSION[path.extname(fileName).toLowerCase()]
}

// ---------------------------------------------------------------------------
// JS parser
// ---------------------------------------------------------------------------
function createJSParser(): (text: string, fileName: string) => Promise<JSAst> {
  return async function parse(text: string, fileName: string): Promise<JSAst> {
    const { root, comments } = parseWithOxc(text, fileName, 'js')
    return { originFileName: fileName, rawContent: text, format: 'js', root, comments }
  }
}

// ---------------------------------------------------------------------------
// TS / TSX parsers
// ---------------------------------------------------------------------------

export async function parseTS(text: string, fileName: string): Promise<TSAst> {
  const { root, comments } = parseWithOxc(text, fileName, 'ts')
  return { originFileName: fileName, rawContent: text, format: 'ts', root, comments }
}

export async function parseTsx(
  text: string,
  fileName: string,
): Promise<TsxAst> {
  const { root, comments } = parseWithOxc(text, fileName, 'tsx')
  return { root, comments, format: 'tsx', originFileName: fileName, rawContent: text }
}
// ---------------------------------------------------------------------------
// HTML parser
// ---------------------------------------------------------------------------

const SCRIPT_TYPE_FORMATS: Readonly<Record<string, ScriptFormat>> = {
  tsx: 'tsx',
  'text/tsx': 'tsx',
  ts: 'ts',
  'text/typescript': 'ts',
  typescript: 'ts',
  js: 'js',
  'text/javascript': 'js',
  javascript: 'js',
  module: 'js',
}

/*
The parser implementation in this file is heavily based on prettier's html parser
https://github.com/prettier/prettier/blob/5a7162d0636a82c5862b9101b845af40918d22d1/src/language-html/parser-html.js
*/
export async function parseHtml(
  text: string,
  originFileName: string,
  context: ParserContext,
): Promise<HtmlAst> {
  const root = await ngHtmlParser(text, originFileName, context)

  return {
    originFileName,
    rawContent: text,
    format: 'html',
    root,
  }
}

async function ngHtmlParser(
  text: string,
  fileName: string,
  parserContext: ParserContext,
): Promise<HtmlRootNode> {
  const ngParser = await import('angular-html-parser')

  const { rootNodes, errors } = ngParser.parse(text, {
    canSelfClose: true,
    allowHtmComponentClosingTags: true,
    isTagNameCaseSensitive: true,
  })

  if (errors.length !== 0) {
    throw htmlErrorFailure(errors, fileName)
  }
  const scriptsAsPromised: Array<Promise<ScriptAst>> = []
  // `visitAll` takes the `Visitor` INTERFACE, not a class — `RecursiveVisitor`
  // merely `implements Visitor` — and `visitAll` is itself exported, so the
  // descent `RecursiveVisitor.visitElement` would have provided is one call. A
  // plain object closing over `scriptsAsPromised` therefore does the whole job
  // without inheriting a vendor base class.
  const scriptCollector: NGAst.Visitor = {
    visitElement: (el: NGAst.Element, context: unknown): void => {
      const scriptFormat = getScriptType(el)
      if (scriptFormat) {
        scriptsAsPromised.push(parseScript(el, scriptFormat))
      }
      ngParser.visitAll(scriptCollector, el.children, context)
    },
    visitAttribute: () => undefined,
    visitText: () => undefined,
    visitComment: () => undefined,
    visitDocType: () => undefined,
    visitExpansion: () => undefined,
    visitExpansionCase: () => undefined,
    visitBlock: () => undefined,
    visitBlockParameter: () => undefined,
    visitLetDeclaration: () => undefined,
    visitCdata: () => undefined,
    visitComponent: () => undefined,
    visitDirective: () => undefined,
  }
  ngParser.visitAll(scriptCollector, rootNodes)
  const scripts = await Promise.all(scriptsAsPromised)
  const root: HtmlRootNode = {
    scripts,
  }

  return root

  async function parseScript<T extends ScriptFormat>(
    el: NGAst.Element,
    scriptFormat: T,
  ): Promise<AstByFormat[T]> {
    const ast = await parserContext.parse(elementScriptText(el, text), fileName, scriptFormat)
    if (ast != null) {
      const offset = el.startSourceSpan.end
      shiftScriptOffsets(ast, offset.offset)
      return {
        ...ast,
        offset: {
          column: offset.offset,
          line: offset.line,
        },
      }
    }
    return ast
  }
}

function htmlErrorFailure(
  errors: readonly ParseTreeResult['errors'][number][],
  fileName: string,
): ParseFailed {
  const first = errors.at(0)
  if (first === undefined) {
    return new ParseFailed({
      fileName,
      message: 'HTML parser reported errors but first error is missing',
      location: { line: 0, column: 0 },
      cause: errors,
    })
  }
  return new ParseFailed({
    fileName,
    message: first.msg,
    location: toSourceLocation(first.span.start),
    cause: first,
  })
}

function elementScriptText(element: NGAst.Element, document: string): string {
  const endSourceSpan = element.endSourceSpan
  if (endSourceSpan == null) {
    throw new Error('HTML element without an end source span')
  }
  return document.substring(element.startSourceSpan.end.offset, endSourceSpan.start.offset)
}

function toSourceLocation({ line, col }: { line: number; col: number }): {
  line: number
  column: number
} {
  // Offset line with 1, since ngHtmlParser is 0-based
  return { line: line + 1, column: col }
}

function isScriptTag(element: NGAst.Element): boolean {
  return element.name === 'script' && !element.attrs.some((attr) => attr.name === 'src')
}

function scriptTypeAttribute(element: NGAst.Element): NGAst.Attribute | undefined {
  const type = element.attrs.find((attr) => attr.name === 'type')
  if (type !== undefined) {
    return type
  }
  return element.attrs.find((attr) => attr.name === 'lang')
}

function scriptTypeFormat(element: NGAst.Element): ScriptFormat | undefined {
  const attribute = scriptTypeAttribute(element)
  if (attribute === undefined) {
    return 'js'
  }
  return SCRIPT_TYPE_FORMATS[attribute.value.toLowerCase()]
}

function getScriptType(element: NGAst.Element): ScriptFormat | undefined {
  return Match.value(element).pipe(
    Match.when(isScriptTag, (script) => scriptTypeFormat(script)),
    Match.orElse(() => undefined),
  )
}
// ---------------------------------------------------------------------------
// Svelte parser
// ---------------------------------------------------------------------------

interface TemplateRange extends Range {
  isExpression: boolean
}

interface TemplateScriptRange extends TemplateRange {
  format: 'js' | 'ts'
}

interface ScriptTag {
  content: string
  attributes: Record<string, boolean | string>
}

type WalkFn = (
  node: unknown,
  handlers: { enter(node: unknown): void },
) => unknown

interface Version {
  major: number
  minor: number
}

const MINIMUM_SVELTE_VERSION: Version = { major: 3, minor: 30 }
const SVELTE_5: Version = { major: 5, minor: 0 }

const ESTREE_WALKER_MISSING = 'estree-walker module without walk export'
const COMPILER_WALK_MISSING = 'svelte/compiler module without walk export'

const INSTANCE_RANGE_MISSING = 'Svelte instance script without a source range'
const MODULE_RANGE_MISSING = 'Svelte module script without a source range'

const VERSION_PATTERN = /^(\d+)\.(\d+)(?:\.\d+)?/

const TEMPLATE_EXPRESSION_TYPES: Readonly<Record<string, true>> = {
  MustacheTag: true,
  RawMustacheTag: true,
  IfBlock: true,
  ConstTag: true,
  EachBlock: true,
  AwaitBlock: true,
  KeyBlock: true,
  EventHandler: true,
}

function parseVersion(version: string): Version | undefined {
  const match = VERSION_PATTERN.exec(version)
  if (match === null) {
    return undefined
  }
  return versionFromMatch(match)
}

function versionFromMatch(match: RegExpExecArray): Version | undefined {
  const major = Number.parseInt(String(match[1]), 10)
  const minor = Number.parseInt(String(match[2]), 10)
  const invalid = Number.isNaN(major) || Number.isNaN(minor)
  return Match.value(invalid).pipe(
    Match.when(true, (): undefined => undefined),
    Match.orElse(() => ({ major, minor })),
  )
}

function compareVersion(left: Version, right: Version): number {
  return Match.value(left.major === right.major).pipe(
    Match.when(true, () => left.minor - right.minor),
    Match.orElse(() => left.major - right.major),
  )
}

function isAtLeast(version: string, minimum: Version): boolean {
  const parsed = parseVersion(version)
  if (parsed === undefined) {
    return false
  }
  return compareVersion(parsed, minimum) >= 0
}

function isWalkFunction(value: unknown): value is WalkFn {
  return typeof value === 'function'
}

function isRecordWithWalk(value: unknown): value is { walk: WalkFn } {
  return isPlainRecord(value) && isWalkFunction(value['walk'])
}

function isScriptElement(value: unknown): value is Record<string, unknown> {
  return isTagged(value, 'Element') && value['name'] === 'script'
}

function isTextRange(value: unknown): value is Range {
  return isTagged(value, 'Text') && hasNumericRange(value)
}

function isTemplateExpressionTag(value: unknown): value is Record<string, unknown> {
  return isTypedRecord(value) && TEMPLATE_EXPRESSION_TYPES[value['type']] === true
}

/**
 * The first child of a `<script>` element node. A template `<script>` tag
 * carries its code as that single `Text` child.
 */
function scriptChild(node: unknown): unknown {
  return Match.value(node).pipe(
    Match.when(isScriptElement, (element) => firstElement(element['children'])),
    Match.orElse(() => undefined),
  )
}

function firstElement(value: unknown): unknown {
  return Match.value(value).pipe(
    Match.when(isNonEmptyArray, (values) => values[0]),
    Match.orElse(() => undefined),
  )
}

function tryGetScriptRangeFromElement(node: unknown): TemplateRange | undefined {
  return Match.value(scriptChild(node)).pipe(
    Match.when(isTextRange, (range) => ({ start: range.start, end: range.end, isExpression: false })),
    Match.orElse(() => undefined),
  )
}

function templateExpressionRange(node: unknown): TemplateRange | undefined {
  return Match.value(node).pipe(
    Match.when(isTemplateExpressionTag, (tag) => rangedExpressionOf(tag['expression'])),
    Match.orElse(() => undefined),
  )
}

function rangedExpressionOf(payload: unknown): TemplateRange | undefined {
  return Match.value(payload).pipe(
    Match.when(isRangedBaseNode, (expression) => ({
      start: expression.start,
      end: expression.end,
      isExpression: true,
    })),
    Match.orElse(() => undefined),
  )
}

/**
 * Allow instrumentation of Svelte 5 projects without dropping support for Svelte 4.
 * Due to the way Svelte 5 is structured, we can no longer use the typings from Svelte 4, even though
 * we use the legacy AST. The full Svelte 5 migration should update these typings to use the new AST.
 */
function loadWalker(version: string, fileName: string): Promise<WalkFn> {
  return Match.value(isAtLeast(version, SVELTE_5)).pipe(
    Match.when(true, () => loadWalkerModule(import.meta.resolve('estree-walker'), fileName, ESTREE_WALKER_MISSING)),
    Match.orElse(() => loadWalkerModule('svelte/compiler', fileName, COMPILER_WALK_MISSING)),
  )
}

/**
 * The specifier is chosen at run time and both modules are optional peers of
 * this package, so neither can be a static import.
 */
async function loadWalkerModule(specifier: string, fileName: string, cause: string): Promise<WalkFn> {
  const module: unknown = await import(specifier)
  const walk = Match.value(module).pipe(
    Match.when(isRecordWithWalk, (record) => record.walk),
    Match.orElse(() => undefined),
  )
  if (walk === undefined) {
    throw new SvelteWalkerNotFound({ fileName, cause })
  }
  return walk
}

export async function parseSvelte(
  text: string,
  fileName: string,
  context: ParserContext,
): Promise<SvelteAst> {
  const {
    parse: svelteParse,
    preprocess,
    VERSION,
  } = await import('svelte/compiler')

  if (!isAtLeast(VERSION, MINIMUM_SVELTE_VERSION)) {
    throw new SvelteVersionNotSupported({
      version: VERSION,
      fileName,
      cause: `Expected >=3.30`,
    })
  }
  const walk = await loadWalker(VERSION, fileName)

  const lineStarts = computeLineStarts(text)
  const { replacedCode, scriptMap } = await replaceScripts(text)
  const svelteAst: unknown = svelteParse(replacedCode, { filename: fileName })

  const moduleScriptRange = getModuleScriptRange(svelteAst)
  const templateRanges = getTemplateScriptRanges(svelteAst, walk)
  const { remappedModuleScriptRange, remappedScriptRanges } = remapScriptLocations(
    replacedCode,
    scriptMap,
    moduleScriptRange,
    templateRanges,
  )

  const [moduleScript, ...additionalScripts] = await Promise.all([
    parseTemplateScriptIfDefined(remappedModuleScriptRange),
    ...remappedScriptRanges.map(parseTemplateScript),
  ])

  return {
    originFileName: fileName,
    rawContent: text,
    format: 'svelte',
    root: svelteRoot(moduleScript, additionalScripts),
  }

  /**
   * Replaces script tags with placeholders.
   * This is needed, because svelte's `parse` doesn't support `lang="ts"`.
   */
  async function replaceScripts(code: string) {
    const map = new Map<string, ScriptTag>()
    let scriptIndex = 0
    const result = await preprocess(code, {
      script(script) {
        const scriptName = `script${scriptIndex++}`
        map.set(scriptName, script)
        return { code: scriptName }
      },
    })
    return { replacedCode: result.code, scriptMap: map }
  }

  async function parseTemplateScriptIfDefined(
    range?: TemplateScriptRange,
  ): Promise<TemplateScript | undefined> {
    if (range) {
      return parseTemplateScript(range)
    }
    return undefined
  }
  async function parseTemplateScript({
    start,
    end,
    isExpression,
    format,
  }: TemplateScriptRange): Promise<TemplateScript> {
    const scriptText = text.slice(start, end)
    const parsed = await context.parse(scriptText, fileName, format)
    return {
      ast: {
        ...parsed,
        offset: positionFromOffset(lineStarts, start),
      },
      range: { start, end },
      isExpression,
    }
  }
}

function svelteRoot(
  moduleScript: TemplateScript | undefined,
  additionalScripts: TemplateScript[],
): SvelteRootNode {
  return Match.value(moduleScript).pipe(
    Match.when(undefined, () => ({ additionalScripts })),
    Match.orElse((script) => ({ moduleScript: script, additionalScripts })),
  )
}

/**
 * Every script range the compiler reports outside `<script>` tag bodies: the
 * instance script plus each template expression the walker visits.
 */
function getTemplateScriptRanges(ast: unknown, walker: WalkFn): TemplateRange[] {
  const ranges: TemplateRange[] = []
  appendIfDefined(ranges, instanceScriptRange(ast))
  walker(htmlRootOf(ast), {
    enter(node: unknown): void {
      appendIfDefined(ranges, tryGetScriptRangeFromElement(node))
      appendIfDefined(ranges, templateExpressionRange(node))
    },
  })
  return ranges
}

function htmlRootOf(ast: unknown): unknown {
  return Match.value(ast).pipe(
    Match.when(hasHtml, (record) => record['html']),
    Match.orElse(() => {
      throw new Error('Svelte AST without html')
    }),
  )
}

function instanceScriptRange(ast: unknown): TemplateRange | undefined {
  return Match.value(fieldOf(ast, 'instance')).pipe(
    Match.when(hasContent, (instance) => scriptContentRange(instance['content'], INSTANCE_RANGE_MISSING)),
    Match.orElse(() => undefined),
  )
}

function scriptContentRange(content: unknown, missingRange: string): TemplateRange {
  return Match.value(content).pipe(
    Match.when(isRange, (range) => ({ start: range.start, end: range.end, isExpression: false })),
    Match.orElse(() => {
      throw new Error(missingRange)
    }),
  )
}

function getModuleScriptRange(
  svelteAst: unknown,
): TemplateRange | undefined {
  return Match.value(fieldOf(svelteAst, 'module')).pipe(
    Match.when(undefined, () => undefined),
    Match.when(null, () => undefined),
    Match.orElse((block) => moduleBlockRange(block)),
  )
}

function moduleBlockRange(block: unknown): TemplateRange {
  return Match.value(block).pipe(
    Match.when(hasContent, (record) => scriptContentRange(record['content'], MODULE_RANGE_MISSING)),
    Match.orElse(() => {
      throw new Error(MODULE_RANGE_MISSING)
    }),
  )
}

/** A script range after its placeholder was replaced by the real script text. */
interface RemappedScript {
  readonly range: TemplateRange
  readonly scriptRange: TemplateScriptRange
  readonly hadScript: boolean
}

/** How much a placeholder's replacement changes the offsets that follow it. */
interface RangeRemap {
  readonly placeholderLength: number
  readonly contentLength: number
  readonly format: 'js' | 'ts'
  readonly hadScript: boolean
}

/**
 * Remaps script locations back to the original places using the script map
 */
function remapScriptLocations(
  code: string,
  scriptMap: Map<string, ScriptTag>,
  moduleScriptRange: TemplateRange | undefined,
  templateRanges: TemplateRange[],
): {
  remappedModuleScriptRange: TemplateScriptRange | undefined
  remappedScriptRanges: TemplateScriptRange[]
} {
  const ordered = [moduleScriptRange, ...templateRanges]
    .filter(Predicate.isNotNullish)
    .sort((left, right) => left.start - right.start)
  const remapped = remapInOrder(ordered, code, scriptMap)
  const moduleScript = remapped.find(
    (script) => script.range === moduleScriptRange && script.hadScript,
  )
  const remappedModuleScriptRange = Match.value(moduleScript).pipe(
    Match.when(undefined, () => undefined),
    Match.orElse((script) => script.scriptRange),
  )
  return {
    remappedModuleScriptRange,
    remappedScriptRanges: remapped
      .map((script) => script.scriptRange)
      .filter((range) => range !== remappedModuleScriptRange),
  }
}

function remapInOrder(
  ranges: readonly TemplateRange[],
  code: string,
  scriptMap: Map<string, ScriptTag>,
): RemappedScript[] {
  let offset = 0
  return ranges.map((range) => {
    const remap = remapRange(range, code, scriptMap)
    const start = range.start + offset
    offset += remap.contentLength - remap.placeholderLength
    return {
      range,
      scriptRange: {
        start,
        end: start + remap.contentLength,
        isExpression: range.isExpression,
        format: remap.format,
      },
      hadScript: remap.hadScript,
    }
  })
}

function remapRange(
  range: TemplateRange,
  code: string,
  scriptMap: Map<string, ScriptTag>,
): RangeRemap {
  const placeholder = code.substring(range.start, range.end)
  return Match.value(scriptMap.get(placeholder)).pipe(
    Match.when(undefined, (): RangeRemap => ({
      placeholderLength: placeholder.length,
      contentLength: placeholder.length,
      format: 'js',
      hadScript: false,
    })),
    Match.orElse((script): RangeRemap => ({
      placeholderLength: placeholder.length,
      contentLength: script.content.length,
      format: scriptFormatOf(script),
      hadScript: true,
    })),
  )
}

function scriptFormatOf(script: ScriptTag): 'js' | 'ts' {
  if (script.attributes['lang'] === 'ts') {
    return 'ts'
  }
  return 'js'
}
