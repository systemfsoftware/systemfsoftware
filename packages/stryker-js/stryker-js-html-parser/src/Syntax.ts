/**
 * Syntax — this package's own AST shapes for the html format.
 *
 * Self-contained by design: nothing here is imported from the instrumenter, and
 * the only region modelled is the one a mutation engine can change, a
 * document's `<script>` bodies.
 */

/** The script languages this parser hands back to its host. */
export type ScriptFormat = 'js' | 'ts' | 'tsx'

/** A half-open character range into the parsed document. */
export interface Range {
  readonly start: number
  readonly end: number
}

/**
 * Where a script body starts, under the ported field names: `line` is the html
 * parser's own 0-based line for the body start, and `column` carries that
 * body's absolute character offset — the value a host shifts a parsed script by.
 */
export interface Position {
  readonly line: number
  readonly column: number
}

/** Where a failure was reported: 1-based line, 0-based column. */
export interface SourceLocation {
  readonly line: number
  readonly column: number
}

/**
 * One instrumentable `<script>` body: its range in the document, the language
 * it is written in, its text, and where the host must place a parse of it.
 */
export interface HtmlScript {
  readonly range: Range
  readonly format: ScriptFormat
  readonly content: string
  readonly offset: Position
}

/** The root of a parsed document: its script bodies, and nothing else. */
export interface HtmlRootNode {
  readonly scripts: readonly HtmlScript[]
}

/** A parsed html document, in the ported `HtmlAst` shape. */
export interface HtmlAst {
  readonly originFileName: string
  readonly rawContent: string
  readonly format: 'html'
  readonly root: HtmlRootNode
}

const ParseFailedTag = { _tag: 'ParseFailed' } as const

type ParseFailedTag = typeof ParseFailedTag

/**
 * The ported `ParseFailed` shape as plain data: the html parser's first error,
 * returned to the caller rather than thrown across the factory boundary.
 */
export interface ParseFailed extends ParseFailedTag {
  readonly fileName: string
  readonly message: string
  readonly location: SourceLocation
  readonly cause: unknown
}

/** The outcome of parsing a document: the tree, or the failure that replaced it. */
export type HtmlParseResult = HtmlAst | ParseFailed

/**
 * Narrows a parse outcome to its failure arm, so a caller can branch on the
 * reported error before touching the tree.
 */
export function isParseFailed(result: HtmlParseResult): result is ParseFailed {
  return '_tag' in result
}
