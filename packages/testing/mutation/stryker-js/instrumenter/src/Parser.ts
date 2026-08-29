/**
 * Parser — all parsers that turn source text into the instrumenter's ASTs.
 */
import type { Ast as NGAst } from 'angular-html-parser'
import * as Predicate from 'effect/Predicate'
import type { BaseNode, Program } from 'estree'
import { parseSync } from 'oxc-parser'
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
// Oxc parse — one engine for js, ts and tsx.
// ---------------------------------------------------------------------------

function parseWithOxc(
  text: string,
  fileName: string,
  lang: 'js' | 'jsx' | 'ts' | 'tsx',
): { root: Program; comments: readonly SpannedComment[] } {
  const result = parseSync(fileName, text, { lang, range: true })
  if (result.errors.length > 0) {
    const first = result.errors[0]
    const label = first?.labels[0]
    const position = positionFromLineTable(label?.start ?? 0, buildLineTable(text))
    throw new ParseFailed({
      fileName,
      message: first?.message ?? 'unknown parse error',
      location: position,
      cause: result.errors.map((error) => error.message),
    })
  }
  // oxc's Program and comments are structurally the estree Program /
  // SpannedComment shapes the rest of this package works with; the boundary
  // casts name that contract once, and the scoped disables stay on those lines.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const program = result.program as unknown as Program
  // oxlint-disable-next-line typescript/no-unnecessary-type-assertion typescript/no-unsafe-type-assertion
  return { root: program, comments: result.comments as readonly SpannedComment[] }
}

/**
 * Shifts a parsed script's root span by the offset of the script tag inside
 * the embedding document (html/svelte), so range math against the raw
 * document stays consistent. Child nodes keep their script-relative offsets —
 * mutant positions are re-mapped through the AST's `offset` field.
 */
function shiftScriptOffsets(ast: Ast, offset: number): void {
  const root: unknown = ast.root
  if (
    typeof root === 'object' && root !== null && 'start' in root && 'end' in root &&
    typeof root.start === 'number' && typeof root.end === 'number'
  ) {
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
    switch (format) {
      case 'js':
        return jsParse(code, fileName)
      case 'tsx':
        return parseTsx(code, fileName)
      case 'ts':
        return parseTS(code, fileName)
      case 'html':
        return parseHtml(code, fileName, { parse })
      case 'svelte':
        return parseSvelte(code, fileName, { parse })
    }
    throw new Error(`Unsupported format: ${String(format satisfies never)}`)
  }

  return parse
}

export function getFormat(
  fileName: string,
  override?: AstFormat,
): AstFormat | undefined {
  if (override) {
    return override
  } else {
    const ext = path.extname(fileName).toLowerCase()
    switch (ext) {
      case '.js':
      case '.jsx':
      case '.mjs':
      case '.cjs':
        return 'js'
      case '.mts':
      case '.cts':
      case '.ts':
        return 'ts'
      case '.tsx':
        return 'tsx'
      case '.vue':
      case '.html':
      case '.htm':
        return 'html'
      case '.svelte':
        return 'svelte'
      default:
        return undefined
    }
  }
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

const TSX_SCRIPT_TYPES = Object.freeze(['tsx', 'text/tsx'])
const TS_SCRIPT_TYPES = Object.freeze(['ts', 'text/typescript', 'typescript'])
const JS_SCRIPT_TYPES = Object.freeze([
  'js',
  'text/javascript',
  'javascript',
  'module',
])

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
    const firstError = errors[0]
    if (firstError === undefined) {
      throw new ParseFailed({
        fileName,
        message: 'HTML parser reported errors but first error is missing',
        location: { line: 0, column: 0 },
        cause: errors,
      })
    }
    throw new ParseFailed({
      fileName,
      message: firstError.msg,
      location: toSourceLocation(firstError.span.start),
      cause: firstError,
    })
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
    const endSourceSpan = el.endSourceSpan
    if (endSourceSpan == null) {
      throw new Error('HTML element without an end source span')
    }
    const content = text.substring(
      el.startSourceSpan.end.offset,
      endSourceSpan.start.offset,
    )
    const ast = await parserContext.parse(content, fileName, scriptFormat)
    if (ast !== null && ast !== undefined) {
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

function toSourceLocation({ line, col }: { line: number; col: number }): {
  line: number
  column: number
} {
  // Offset line with 1, since ngHtmlParser is 0-based
  return { line: line + 1, column: col }
}

function getScriptType(element: NGAst.Element): ScriptFormat | undefined {
  if (element.name === 'script') {
    const containsSrc = element.attrs.some((attr) => attr.name === 'src')
    if (!containsSrc) {
      const type = element.attrs.find((attr) => attr.name === 'type') ??
        element.attrs.find((attr) => attr.name === 'lang')
      if (type) {
        const typeToLower = type.value.toLowerCase()
        const tsxTypes: readonly string[] = TSX_SCRIPT_TYPES
        if (tsxTypes.includes(typeToLower)) {
          return 'tsx'
        }
        const tsTypes: readonly string[] = TS_SCRIPT_TYPES
        if (tsTypes.includes(typeToLower)) {
          return 'ts'
        }
        const jsTypes: readonly string[] = JS_SCRIPT_TYPES
        if (jsTypes.includes(typeToLower)) {
          return 'js'
        }
      } else {
        return 'js'
      }
    }
  }
  return undefined
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

type RangedProgram = Program & Range

function parseVersion(version: string): { major: number; minor: number } | undefined {
  const match = /^(\d+)\.(\d+)(?:\.\d+)?/.exec(version)
  if (!match) {
    return undefined
  }
  const major = Number.parseInt(match[1] ?? '', 10)
  const minor = Number.parseInt(match[2] ?? '', 10)
  if (Number.isNaN(major) || Number.isNaN(minor)) {
    return undefined
  }
  return { major, minor }
}

function isSupportedSvelteVersion(version: string): boolean {
  const parsed = parseVersion(version)
  if (parsed === undefined) {
    return false
  }
  return parsed.major > 3 || (parsed.major === 3 && parsed.minor >= 30)
}

function isSvelteV5OrLater(version: string): boolean {
  const parsed = parseVersion(version)
  if (parsed === undefined) {
    return false
  }
  return parsed.major >= 5
}

type WalkFn = (
  node: unknown,
  handlers: { enter(node: unknown): void },
) => unknown

function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

function isRangedProgram(value: unknown): value is RangedProgram {
  return (
    isPlainRecord(value) &&
    typeof value['start'] === 'number' &&
    typeof value['end'] === 'number'
  )
}

function isWalkFunction(value: unknown): value is WalkFn {
  return typeof value === 'function'
}

function isRangedBaseNode(value: unknown): value is BaseNode & Range {
  return (
    isPlainRecord(value) &&
    typeof value['type'] === 'string' &&
    typeof value['start'] === 'number' &&
    typeof value['end'] === 'number'
  )
}

function isTemplateExpressionType(type: string): boolean {
  return (
    type === 'MustacheTag' ||
    type === 'RawMustacheTag' ||
    type === 'IfBlock' ||
    type === 'ConstTag' ||
    type === 'EachBlock' ||
    type === 'AwaitBlock' ||
    type === 'KeyBlock' ||
    type === 'EventHandler'
  )
}

function tryGetScriptRangeFromElement(
  node: unknown,
): TemplateRange | undefined {
  if (
    !isPlainRecord(node) ||
    node['type'] !== 'Element' ||
    node['name'] !== 'script'
  ) {
    return undefined
  }
  const children = node['children']
  if (!isUnknownArray(children) || children.length === 0) {
    return undefined
  }
  const firstChild: unknown = children[0]
  if (
    !isPlainRecord(firstChild) ||
    firstChild['type'] !== 'Text' ||
    typeof firstChild['start'] !== 'number' ||
    typeof firstChild['end'] !== 'number'
  ) {
    return undefined
  }
  return {
    start: firstChild['start'],
    end: firstChild['end'],
    isExpression: false,
  }
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
  let walk: WalkFn

  if (!isSupportedSvelteVersion(VERSION)) {
    throw new SvelteVersionNotSupported({
      version: VERSION,
      fileName,
      cause: `Expected >=3.30`,
    })
  }
  /*
    Allow instrumentation of Svelte 5 projects without dropping support for Svelte 4.
    Due to the way Svelte 5 is structured, we can no longer use the typings from Svelte 4, even though
    we use the legacy AST. The full Svelte 5 migration should update these typings to use the new AST.
  */
  if (isSvelteV5OrLater(VERSION)) {
    const walkerModule: unknown = await import(import.meta.resolve('estree-walker'))
    if (
      !isPlainRecord(walkerModule) ||
      !isWalkFunction(walkerModule['walk'])
    ) {
      throw new SvelteWalkerNotFound({ fileName, cause: 'estree-walker module without walk export' })
    }
    walk = walkerModule['walk']
  } else {
    // Svelte 4
    const svelteCompilerModule: unknown = await import('svelte/compiler')
    if (
      !isPlainRecord(svelteCompilerModule) ||
      !isWalkFunction(svelteCompilerModule['walk'])
    ) {
      throw new SvelteWalkerNotFound({ fileName, cause: 'svelte/compiler module without walk export' })
    }
    walk = svelteCompilerModule['walk']
  }

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
  let root: SvelteRootNode
  if (moduleScript === undefined) {
    root = {
      additionalScripts,
    }
  } else {
    root = {
      moduleScript,
      additionalScripts,
    }
  }

  return {
    originFileName: fileName,
    rawContent: text,
    format: 'svelte',
    root,
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

  function getTemplateScriptRanges(
    ast: unknown,
    walker: WalkFn,
  ): TemplateRange[] {
    const ranges: TemplateRange[] = []

    if (
      isPlainRecord(ast) &&
      ast['instance'] !== null &&
      ast['instance'] !== undefined
    ) {
      const instance = ast['instance']
      if (isPlainRecord(instance) && 'content' in instance) {
        const content = instance['content']
        if (isRangedProgram(content)) {
          ranges.push({
            start: content.start,
            end: content.end,
            isExpression: false,
          })
        } else {
          throw new Error('Svelte instance script without a source range')
        }
      }
    }

    if (!isPlainRecord(ast) || !('html' in ast)) {
      throw new Error('Svelte AST without html')
    }
    const html = ast['html']
    walker(html, {
      enter(node: unknown) {
        const scriptRange = tryGetScriptRangeFromElement(node)
        if (scriptRange) {
          ranges.push(scriptRange)
        }

        const templateExpression = collectTemplateExpression(node)
        if (templateExpression) {
          const { start, end } = templateExpression
          ranges.push({ start, end, isExpression: true })
        }
      },
    })

    return ranges
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

function getModuleScriptRange(
  svelteAst: unknown,
): TemplateRange | undefined {
  if (
    !isPlainRecord(svelteAst) ||
    !('module' in svelteAst) ||
    svelteAst['module'] === null ||
    svelteAst['module'] === undefined
  ) {
    return undefined
  }
  const mod = svelteAst['module']
  if (!isPlainRecord(mod) || !('content' in mod)) {
    throw new Error('Svelte module script without a source range')
  }
  const content = mod['content']
  if (!isRangedProgram(content)) {
    throw new Error('Svelte module script without a source range')
  }
  return { start: content.start, end: content.end, isExpression: false }
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
  const scriptRanges = [moduleScriptRange, ...templateRanges]
    .filter(Predicate.isNotNullish)
    .sort((a, b) => a.start - b.start)
  let offset = 0
  let newModuleScriptRange: TemplateScriptRange | undefined
  const newScriptRanges: TemplateScriptRange[] = scriptRanges.map((range) => {
    const script = code.substring(range.start, range.end)
    const actualScript = scriptMap.get(script)
    const start = range.start + offset
    if (actualScript) {
      let langFormat: TemplateScriptRange['format'] = 'js'
      if (actualScript.attributes['lang'] === 'ts') {
        langFormat = 'ts'
      }
      const scriptRange: TemplateScriptRange = {
        start,
        end: start + actualScript.content.length,
        isExpression: range.isExpression,
        format: langFormat,
      }
      offset += actualScript.content.length - script.length
      if (range === moduleScriptRange) {
        newModuleScriptRange = scriptRange
      }
      return scriptRange
    } else {
      // Template script is always JS
      return {
        start,
        end: start + script.length,
        isExpression: range.isExpression,
        format: 'js',
      }
    }
  })
  return {
    remappedModuleScriptRange: newModuleScriptRange,
    remappedScriptRanges: newScriptRanges.filter(
      (range) => range !== newModuleScriptRange,
    ),
  }
}

function collectTemplateExpression(
  node: unknown,
): (BaseNode & Range) | undefined {
  if (!isPlainRecord(node) || typeof node['type'] !== 'string') {
    return undefined
  }
  if (!isTemplateExpressionType(node['type'])) {
    return undefined
  }
  if (!('expression' in node)) {
    return undefined
  }
  const expression = node['expression']
  if (isRangedBaseNode(expression)) {
    return expression
  }
  return undefined
}
