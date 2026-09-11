/**
 * Parser — the svelte format parser. It locates a component's script bodies and
 * template expressions in the raw document and hands the host plain data: each
 * range, the text inside it, and the format to parse that text as.
 */
import { isAtLeast, loadSvelteCompiler, loadTemplateWalker, type Version, type WalkFn } from './Compiler.js'
import {
  fail,
  SvelteFailure,
  svelteParseFailed,
  type SvelteParserFailure,
  svelteVersionNotSupported,
} from './Failure.js'
import { isRecord } from './Guard.js'
import {
  computeLineStarts,
  type LineStarts,
  positionFromOffset,
  type Range,
  type ScriptFormat,
  type SvelteAst,
  type SvelteRootNode,
  type TemplateScript,
} from './Syntax.js'

/** The extension this format claims. */
export const SVELTE_EXTENSION = '.svelte'

/** What the host supplies when it builds the parser. */
export interface SvelteParserOptions {
  /**
   * The project whose install the svelte compiler resolves from. Defaults to
   * the process directory: the project Stryker runs in, whose sandbox — and
   * therefore the compiler it resolves — sits inside it.
   */
  readonly projectDir?: string
}

/** The factory's result: the extensions this format claims and its parse. */
export interface SvelteParser {
  readonly extensions: readonly string[]
  readonly parse: (input: string, fileName: string) => SvelteAst | SvelteParserFailure
}

const MINIMUM_SVELTE_VERSION: Version = { major: 3, minor: 30 }

const INSTANCE_RANGE_MISSING = 'Svelte instance script without a source range'
const MODULE_RANGE_MISSING = 'Svelte module script without a source range'

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

/** A script element, matched only when no comment ran over it. */
const SCRIPT_OR_COMMENT = /<!--[\s\S]*?-->|<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
const ATTRIBUTE_PATTERN = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

interface TemplateRange extends Range {
  readonly isExpression: boolean
}

interface TemplateScriptRange extends TemplateRange {
  readonly format: ScriptFormat
}

interface ScriptTag {
  readonly content: string
  readonly attributes: Readonly<Record<string, boolean | string>>
}

interface ScriptSpec {
  readonly contentStart: number
  readonly content: string
  readonly attributes: Readonly<Record<string, boolean | string>>
}

interface ScriptReplacement {
  readonly replacedCode: string
  readonly scriptMap: Readonly<Record<string, ScriptTag>>
}

interface RangeRemap {
  readonly placeholderLength: number
  readonly contentLength: number
  readonly format: ScriptFormat
  readonly hadScript: boolean
}

interface RemappedScript {
  readonly range: TemplateRange
  readonly scriptRange: TemplateScriptRange
  readonly hadScript: boolean
}

interface RemappedScriptLocations {
  readonly remappedModuleScriptRange: TemplateScriptRange | undefined
  readonly remappedScriptRanges: readonly TemplateScriptRange[]
}

export function makeSvelteParser(options: SvelteParserOptions = {}): SvelteParser {
  const projectDir = projectDirOf(options)
  return {
    extensions: [SVELTE_EXTENSION],
    parse: (input: string, fileName: string) => parseComponent(input, fileName, projectDir),
  }
}

function projectDirOf(options: SvelteParserOptions): string {
  const configured = options.projectDir
  if (configured === undefined) {
    return process.cwd()
  }
  return configured
}

/**
 * Parses a component or fails. Every failure below leaves as a named value: the
 * helpers throw `SvelteFailure` and this boundary unwraps it, so nothing throws
 * across the factory's public surface.
 */
export function parseSvelte(text: string, fileName: string, projectDir: string): SvelteAst {
  const compiler = loadSvelteCompiler(projectDir, fileName)
  if (!isAtLeast(compiler.VERSION, MINIMUM_SVELTE_VERSION)) {
    return fail(
      svelteVersionNotSupported(
        fileName,
        compiler.VERSION,
        `>=${MINIMUM_SVELTE_VERSION.major}.${MINIMUM_SVELTE_VERSION.minor}`,
      ),
    )
  }
  const walk = loadTemplateWalker(projectDir, compiler.VERSION, fileName)
  const lineStarts = computeLineStarts(text)
  const { replacedCode, scriptMap } = replaceScripts(text)
  const svelteAst: unknown = compiler.parse(replacedCode, { filename: fileName })
  const moduleScriptRange = getModuleScriptRange(svelteAst)
  const templateRanges = getTemplateScriptRanges(svelteAst, walk)
  const remapped = remapScriptLocations(replacedCode, scriptMap, moduleScriptRange, templateRanges)
  const moduleScript = moduleTemplateScript(remapped.remappedModuleScriptRange, text, lineStarts)
  const additionalScripts = remapped.remappedScriptRanges.map((range) => templateScript(range, text, lineStarts))
  return {
    originFileName: fileName,
    rawContent: text,
    format: 'svelte',
    root: svelteRoot(moduleScript, additionalScripts),
  }
}

function parseComponent(input: string, fileName: string, projectDir: string): SvelteAst | SvelteParserFailure {
  try {
    return parseSvelte(input, fileName, projectDir)
  } catch (error) {
    return failureOf(error, fileName)
  }
}

function failureOf(error: unknown, fileName: string): SvelteParserFailure {
  if (error instanceof SvelteFailure) {
    return error.failure
  }
  return svelteParseFailed(fileName, error)
}

/**
 * Replaces every script body with an identifier, because the compiler's parse
 * does not accept `lang="ts"` content. Comments match first, so a commented-out
 * script tag is left alone. The compiler then reports the placeholder ranges,
 * and `remapScriptLocations` maps those back onto the real text — the offsets
 * that follow each replacement move by the difference in length.
 */
function replaceScripts(text: string): ScriptReplacement {
  const specs = scriptSpecs(text)
  const scriptMap: Record<string, ScriptTag> = {}
  const pieces: string[] = []
  let cursor = 0
  for (const [index, spec] of specs.entries()) {
    const placeholder = `script${index}`
    scriptMap[placeholder] = { content: spec.content, attributes: spec.attributes }
    pieces.push(text.slice(cursor, spec.contentStart), placeholder)
    cursor = spec.contentStart + spec.content.length
  }
  return { replacedCode: pieces.join('') + text.slice(cursor), scriptMap: scriptMap }
}

function scriptSpecs(text: string): ScriptSpec[] {
  const matches = [...text.matchAll(SCRIPT_OR_COMMENT)]
  return matches.filter((match) => match[1] !== undefined).map((match) => scriptSpecOf(match))
}

function scriptSpecOf(match: RegExpExecArray): ScriptSpec {
  return {
    contentStart: match.index + match[0].indexOf('>') + 1,
    content: textOrEmpty(match[2]),
    attributes: parseAttributes(textOrEmpty(match[1])),
  }
}

/** A regexp capture is `string | undefined`; an absent one is the empty text. */
function textOrEmpty(value: string | undefined): string {
  return value ?? ''
}

function parseAttributes(text: string): Readonly<Record<string, boolean | string>> {
  const attributes: Record<string, boolean | string> = {}
  for (const match of text.matchAll(ATTRIBUTE_PATTERN)) {
    attributes[textOrEmpty(match[1])] = attributeValueOf(match)
  }
  return attributes
}

function attributeValueOf(match: RegExpExecArray): string | true {
  const values = [match[2], match[3], match[4]]
  return values.find((value) => typeof value === 'string') ?? true
}

function scriptFormatOf(tag: ScriptTag): ScriptFormat {
  if (tag.attributes['lang'] === 'ts') {
    return 'ts'
  }
  return 'js'
}

/** A script range after its placeholder was replaced by the real script text. */
function remapScriptLocations(
  code: string,
  scriptMap: Readonly<Record<string, ScriptTag>>,
  moduleScriptRange: TemplateRange | undefined,
  templateRanges: readonly TemplateRange[],
): RemappedScriptLocations {
  const ordered = orderedRanges(moduleScriptRange, templateRanges)
  const remapped = remapInOrder(ordered, code, scriptMap)
  const moduleScript = remapped.find((script) => script.range === moduleScriptRange && script.hadScript)
  const remappedModuleScriptRange = moduleScript?.scriptRange
  return {
    remappedModuleScriptRange: remappedModuleScriptRange,
    remappedScriptRanges: remapped
      .map((script) => script.scriptRange)
      .filter((range) => range !== remappedModuleScriptRange),
  }
}

function orderedRanges(
  moduleScriptRange: TemplateRange | undefined,
  templateRanges: readonly TemplateRange[],
): TemplateRange[] {
  const ranges: (TemplateRange | undefined)[] = [moduleScriptRange, ...templateRanges]
  return ranges.filter(isDefined).sort((left, right) => left.start - right.start)
}

function remapInOrder(
  ranges: readonly TemplateRange[],
  code: string,
  scriptMap: Readonly<Record<string, ScriptTag>>,
): RemappedScript[] {
  let offset = 0
  return ranges.map((range) => {
    const remap = remapRange(range, code, scriptMap)
    const start = range.start + offset
    offset += remap.contentLength - remap.placeholderLength
    return {
      range: range,
      scriptRange: {
        start: start,
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
  scriptMap: Readonly<Record<string, ScriptTag>>,
): RangeRemap {
  const placeholder = code.substring(range.start, range.end)
  const script = tagOf(scriptMap, placeholder)
  if (script === undefined) {
    return { placeholderLength: placeholder.length, contentLength: placeholder.length, format: 'js', hadScript: false }
  }
  return {
    placeholderLength: placeholder.length,
    contentLength: script.content.length,
    format: scriptFormatOf(script),
    hadScript: true,
  }
}

/** Own-key lookup: a template expression named like a record member is not a placeholder. */
function tagOf(scriptMap: Readonly<Record<string, ScriptTag>>, placeholder: string): ScriptTag | undefined {
  if (!Object.hasOwn(scriptMap, placeholder)) {
    return undefined
  }
  return scriptMap[placeholder]
}

/**
 * Every script range the compiler reports outside script tag bodies: the module
 * script, the instance script, and each template expression the walker visits.
 */
function getTemplateScriptRanges(ast: unknown, walker: WalkFn): TemplateRange[] {
  const ranges = instanceRanges(ast)
  walker(htmlRootOf(ast), {
    enter(node: unknown): void {
      appendIfDefined(ranges, tryGetScriptRangeFromElement(node))
      appendIfDefined(ranges, templateExpressionRange(node))
    },
  })
  return ranges
}

function instanceRanges(ast: unknown): TemplateRange[] {
  const range = instanceScriptRange(ast)
  return [range].filter(isDefined)
}

function appendIfDefined(values: TemplateRange[], value: TemplateRange | undefined): void {
  if (value !== undefined) {
    values.push(value)
  }
}

function htmlRootOf(ast: unknown): unknown {
  if (!hasHtml(ast)) {
    throw new Error('Svelte AST without html')
  }
  return ast['html']
}

function instanceScriptRange(ast: unknown): TemplateRange | undefined {
  const instance = fieldOf(ast, 'instance')
  if (!hasContent(instance)) {
    return undefined
  }
  return scriptContentRange(instance['content'], INSTANCE_RANGE_MISSING)
}

function getModuleScriptRange(ast: unknown): TemplateRange | undefined {
  const block = fieldOf(ast, 'module')
  if (!isRecord(block)) {
    return undefined
  }
  return moduleBlockRange(block)
}

function moduleBlockRange(block: unknown): TemplateRange {
  if (!hasContent(block)) {
    throw new Error(MODULE_RANGE_MISSING)
  }
  return scriptContentRange(block['content'], MODULE_RANGE_MISSING)
}

function scriptContentRange(content: unknown, missingRange: string): TemplateRange {
  if (!isRange(content)) {
    throw new Error(missingRange)
  }
  return { start: content.start, end: content.end, isExpression: false }
}

/**
 * The first child of a `<script>` element node. A template `<script>` tag
 * carries its code as that single `Text` child.
 */
function scriptChild(node: unknown): unknown {
  if (!isScriptElement(node)) {
    return undefined
  }
  return firstChild(node['children'])
}

function firstChild(children: unknown): unknown {
  if (!isNonEmptyArray(children)) {
    return undefined
  }
  return children[0]
}

function tryGetScriptRangeFromElement(node: unknown): TemplateRange | undefined {
  const child = scriptChild(node)
  if (!isTextRange(child)) {
    return undefined
  }
  return { start: child.start, end: child.end, isExpression: false }
}

function templateExpressionRange(node: unknown): TemplateRange | undefined {
  if (!isTemplateExpressionTag(node)) {
    return undefined
  }
  return rangedExpressionOf(node['expression'])
}

function rangedExpressionOf(payload: unknown): TemplateRange | undefined {
  if (!isRangedNode(payload)) {
    return undefined
  }
  return { start: payload.start, end: payload.end, isExpression: true }
}

function templateScript(range: TemplateScriptRange, text: string, lineStarts: LineStarts): TemplateScript {
  return {
    range: { start: range.start, end: range.end },
    format: range.format,
    content: text.slice(range.start, range.end),
    isExpression: range.isExpression,
    offset: positionFromOffset(lineStarts, range.start),
  }
}

function moduleTemplateScript(
  range: TemplateScriptRange | undefined,
  text: string,
  lineStarts: LineStarts,
): TemplateScript | undefined {
  if (range === undefined) {
    return undefined
  }
  return templateScript(range, text, lineStarts)
}

function svelteRoot(
  moduleScript: TemplateScript | undefined,
  additionalScripts: readonly TemplateScript[],
): SvelteRootNode {
  if (moduleScript === undefined) {
    return { additionalScripts: additionalScripts }
  }
  return { moduleScript: moduleScript, additionalScripts: additionalScripts }
}

function fieldOf(value: unknown, key: string): unknown {
  if (!isRecord(value)) {
    return undefined
  }
  return value[key]
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

function isRange(value: unknown): value is Range {
  if (!isRecord(value)) {
    return false
  }
  return hasRangeBounds(value)
}

function hasRangeBounds(record: Record<string, unknown>): record is Record<string, unknown> & Range {
  return typeof record['start'] === 'number' && typeof record['end'] === 'number'
}

function isTypedNode(value: unknown): value is Record<string, unknown> & { readonly type: string } {
  if (!isRecord(value)) {
    return false
  }
  return typeof value['type'] === 'string'
}

function isTagged(value: unknown, type: string): value is Record<string, unknown> & { readonly type: string } {
  if (!isTypedNode(value)) {
    return false
  }
  return value['type'] === type
}

function isRangedNode(value: unknown): value is Record<string, unknown> & Range {
  if (!isTypedNode(value)) {
    return false
  }
  return isRange(value)
}

function isTextRange(value: unknown): value is Range {
  if (!isTagged(value, 'Text')) {
    return false
  }
  return isRange(value)
}

function isScriptElement(value: unknown): value is Record<string, unknown> {
  if (!isTagged(value, 'Element')) {
    return false
  }
  return value['name'] === 'script'
}

function isTemplateExpressionTag(value: unknown): value is Record<string, unknown> {
  if (!isTypedNode(value)) {
    return false
  }
  return TEMPLATE_EXPRESSION_TYPES[value['type']] === true
}

function isNonEmptyArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) {
    return false
  }
  return value.length > 0
}

function hasContent(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false
  }
  return 'content' in value
}

function hasHtml(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false
  }
  return 'html' in value
}
