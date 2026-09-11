/**
 * Parser — the html format parser: a document in, its `<script>` bodies out.
 *
 * Pure by construction: no filesystem, no clock, no randomness, no Effect, and
 * no js/ts parser. Each reported body carries the text, the language and the
 * origin the host parses and shifts it by, so this module never reaches beyond
 * the html parser.
 */
import { parse as parseTemplate, visitAll } from 'angular-html-parser'
import type { Ast as NGAst, ParseTreeResult } from 'angular-html-parser'

import type { HtmlParseResult, HtmlScript, ParseFailed, ScriptFormat, SourceLocation } from './Syntax.js'

/** The option set the ported parser always ran with. */
const HTML_PARSE_OPTIONS = {
  canSelfClose: true,
  allowHtmComponentClosingTags: true,
  isTagNameCaseSensitive: true,
} as const

/**
 * The `type`/`lang` attribute values that name a language the host can parse. A
 * `<script>` without such an attribute is javascript; one naming anything else
 * (json, a template language) is not instrumentable and is skipped.
 */
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

/** The message the ported parser reported when it found no first error to name. */
const MISSING_FIRST_ERROR = 'HTML parser reported errors but first error is missing'

/** The message the ported parser reported for an element with no end source span. */
const MISSING_END_SPAN = 'HTML element without an end source span'

/** A location as the html parser reports it: 0-based line and column, absolute offset. */
interface ReportedLocation {
  readonly line: number
  readonly col: number
  readonly offset: number
}

/** One error the html parser reported, as its `errors` array declares it. */
type HtmlParseError = ParseTreeResult['errors'][number]

/** A `<script>` element that can be instrumented, with the language it carries. */
interface InstrumentableScriptTag {
  readonly element: NGAst.Element
  readonly format: ScriptFormat
}

/** A script body whose end was found: everything the host needs to parse it. */
interface DelimitedScriptBody {
  readonly kind: 'body'
  readonly script: HtmlScript
}

/** A `<script>` element the parser never closed — the vendor's nullable end span. */
interface UnterminatedScriptBody {
  readonly kind: 'unterminated'
  readonly start: ReportedLocation
}

type ScriptBody = DelimitedScriptBody | UnterminatedScriptBody

/**
 * The payload the ABI's `Parser` kind is declared with: the extensions this
 * parser claims, and the synchronous parse that serves them.
 */
export interface HtmlParser {
  readonly extensions: string[]
  parse(input: string, fileName: string): HtmlParseResult
}

/**
 * Parse an html document into the script bodies a mutation engine can
 * instrument. A malformed document yields the failure shape; nothing throws.
 */
export function parseHtml(input: string, fileName: string): HtmlParseResult {
  const parseTree = parseTemplate(input, HTML_PARSE_OPTIONS)
  if (parseTree.errors.length !== 0) {
    return htmlParseFailed(parseTree.errors, fileName)
  }
  return htmlAstReport(input, fileName, parseTree)
}

/** The factory the `html` Parser contribution is declared with. */
export function makeHtmlParser(): HtmlParser {
  return { extensions: ['.html'], parse: parseHtml }
}

function htmlAstReport(input: string, fileName: string, parseTree: ParseTreeResult): HtmlParseResult {
  const bodies = scriptTagsOf(parseTree).map((tag) => scriptBodyOf(tag, input))
  const unterminated = bodies.find(isUnterminatedScriptBody)
  if (unterminated !== undefined) {
    return unterminatedScriptFailure(unterminated, fileName)
  }
  return {
    originFileName: fileName,
    rawContent: input,
    format: 'html',
    root: { scripts: bodies.filter(isDelimitedScriptBody).map((body) => body.script) },
  }
}

/**
 * The ported descent: `visitAll` takes the `Visitor` INTERFACE, not a class, so
 * a plain object closing over the collected tags does the whole job without
 * inheriting a vendor base class.
 */
function scriptTagsOf(parseTree: ParseTreeResult): readonly InstrumentableScriptTag[] {
  const found: InstrumentableScriptTag[] = []
  const collector: NGAst.Visitor = {
    visitElement: (element: NGAst.Element, context: unknown): void => {
      appendScriptTag(found, element)
      visitAll(collector, element.children, context)
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
  visitAll(collector, parseTree.rootNodes)
  return found
}

function appendScriptTag(found: InstrumentableScriptTag[], element: NGAst.Element): void {
  const format = scriptFormatOf(element)
  if (format !== undefined) {
    found.push({ element, format })
  }
}

/** A script element's body, or the failure that its end tag was never found. */
function scriptBodyOf(tag: InstrumentableScriptTag, document: string): ScriptBody {
  const bodyStart = tag.element.startSourceSpan.end
  const endSourceSpan = tag.element.endSourceSpan
  if (endSourceSpan === null) {
    return { kind: 'unterminated', start: bodyStart }
  }
  return {
    kind: 'body',
    script: {
      range: { start: bodyStart.offset, end: endSourceSpan.start.offset },
      format: tag.format,
      content: document.substring(bodyStart.offset, endSourceSpan.start.offset),
      offset: { line: bodyStart.line, column: bodyStart.offset },
    },
  }
}

function carriesBodyInDocument(element: NGAst.Element): boolean {
  const isScriptElement = element.name === 'script'
  const loadsFromAnotherFile = element.attrs.some((attr) => attr.name === 'src')
  return isScriptElement && !loadsFromAnotherFile
}

/**
 * The ported `getScriptType`: the language of a `<script>` whose body sits in
 * the document — one carrying no `src` — or `undefined` for anything else.
 */
function scriptFormatOf(element: NGAst.Element): ScriptFormat | undefined {
  if (!carriesBodyInDocument(element)) {
    return undefined
  }
  return scriptTypeFormat(element)
}

/** The `type` attribute, or `lang` when `type` is absent. */
function scriptTypeAttribute(element: NGAst.Element): NGAst.Attribute | undefined {
  const type = element.attrs.find((attr) => attr.name === 'type')
  if (type !== undefined) {
    return type
  }
  return element.attrs.find((attr) => attr.name === 'lang')
}

/** The language a script element declares, defaulting to javascript. */
function scriptTypeFormat(element: NGAst.Element): ScriptFormat | undefined {
  const attribute = scriptTypeAttribute(element)
  if (attribute === undefined) {
    return 'js'
  }
  return SCRIPT_TYPE_FORMATS[attribute.value.toLowerCase()]
}

/** The ported shift: the html parser reports 0-based lines, the failure shape 1-based. */
function toSourceLocation(position: ReportedLocation): SourceLocation {
  return { line: position.line + 1, column: position.col }
}

function htmlParseFailed(errors: readonly HtmlParseError[], fileName: string): ParseFailed {
  const first = errors.at(0)
  if (first === undefined) {
    // Unreachable — a non-empty `errors` guarantees a first element — and the
    // ported placeholder position carries no information about the document.
    return {
      _tag: 'ParseFailed',
      fileName,
      message: MISSING_FIRST_ERROR,
      location: { line: 0, column: 0 },
      cause: errors,
    }
  }
  return {
    _tag: 'ParseFailed',
    fileName,
    message: first.msg,
    location: toSourceLocation(first.span.start),
    cause: first,
  }
}

function unterminatedScriptFailure(body: UnterminatedScriptBody, fileName: string): ParseFailed {
  return {
    _tag: 'ParseFailed',
    fileName,
    message: MISSING_END_SPAN,
    location: toSourceLocation(body.start),
    cause: undefined,
  }
}

function isDelimitedScriptBody(body: ScriptBody): body is DelimitedScriptBody {
  return body.kind === 'body'
}

function isUnterminatedScriptBody(body: ScriptBody): body is UnterminatedScriptBody {
  return body.kind === 'unterminated'
}
