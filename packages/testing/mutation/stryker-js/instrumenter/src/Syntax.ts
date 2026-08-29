/**
 * Syntax — the instrumenter's AST shapes, location helpers and syntax utilities.
 */
import type { Position } from '@systemfsoftware/stryker-js/Mutant'
import type { Program } from 'estree'
import { AstFormat as SchemaAstFormat } from './Syntax.schema.js'

export const AstFormat = SchemaAstFormat
export type AstFormat = typeof SchemaAstFormat.Type
export interface AstByFormat {
  html: HtmlAst
  js: JSAst
  ts: TSAst
  tsx: TsxAst
  svelte: SvelteAst
}
export type Ast = HtmlAst | JSAst | SvelteAst | TSAst | TsxAst

export type ScriptFormat = Extract<AstFormat, 'js' | 'ts' | 'tsx'>

/**
 * A parsed comment with its source span. oxc emits comments flat with offsets
 * (no loc); consumers that need line/column derive it from the line table.
 */
export interface SpannedComment {
  readonly type: 'Line' | 'Block'
  readonly value: string
  readonly start: number
  readonly end: number
}
export type ScriptAst = JSAst | TSAst | TsxAst
export interface BaseAst {
  originFileName: string
  rawContent: string
  root: Ast['root']
  offset?: Position
}

/**
 * Represents an Html AST.
 */
export interface HtmlAst extends BaseAst {
  format: 'html'
  root: HtmlRootNode
}

/**
 * Represents a TS AST
 */
export interface JSAst extends BaseAst {
  format: 'js'
  root: Program
  comments: readonly SpannedComment[]
}

/**
 * Represents a TS AST
 */
export interface TSAst extends BaseAst {
  format: 'ts'
  root: Program
  comments: readonly SpannedComment[]
}

/**
 * Represents a TS AST
 */
export interface TsxAst extends BaseAst {
  format: 'tsx'
  root: Program
  comments: readonly SpannedComment[]
}

/**
 * Represents a Svelte AST
 */
export interface SvelteAst extends BaseAst {
  format: 'svelte'
  root: SvelteRootNode
}

/**
 * Represents the root node of an HTML AST
 * We've taken a shortcut here, instead of representing the entire AST, we're only representing the script tags.
 * We might need to expand this in the future if we would ever want to support mutating the actual HTML (rather than only the JS/TS)
 */
export interface HtmlRootNode {
  scripts: ScriptAst[]
}

export interface SvelteRootNode {
  moduleScript?: TemplateScript
  additionalScripts: TemplateScript[]
}

/**
 * Represents a svelte script or binding expression
 * We've taken a shortcut here, instead of representing the entire AST, we're only representing the script tags and expression bindings.
 */
export interface TemplateScript {
  ast: ScriptAst
  range: Range
  isExpression: boolean
}

export interface Range {
  start: number
  end: number
}

/**
 * A location of an ast node in a file
 */
export interface SourceLocationInFile {
  end: Position
  start: Position
}

/**
 * Determines if a location (needle) is included in an other location (haystack)
 * @param haystack The range to look in
 * @param needle the range to search for
 */
export function locationIncluded(
  haystack: SourceLocationInFile,
  needle: SourceLocationInFile,
): boolean {
  const startIncluded = haystack.start.line < needle.start.line ||
    (haystack.start.line === needle.start.line &&
      haystack.start.column <= needle.start.column)
  const endIncluded = haystack.end.line > needle.end.line ||
    (haystack.end.line === needle.end.line &&
      haystack.end.column >= needle.end.column)
  return startIncluded && endIncluded
}

/**
 * Determines if two locations overlap with each other
 */
export function locationOverlaps(
  a: SourceLocationInFile,
  b: SourceLocationInFile,
): boolean {
  const startIncluded = a.start.line < b.end.line ||
    (a.start.line === b.end.line && a.start.column <= b.end.column)
  const endIncluded = a.end.line > b.start.line ||
    (a.end.line === b.start.line && a.end.column >= b.start.column)
  return startIncluded && endIncluded
}

export type BinaryOperator =
  | '-'
  | '!='
  | '!=='
  | '*'
  | '**'
  | '/'
  | '&'
  | '%'
  | '^'
  | '+'
  | '<'
  | '<<'
  | '<='
  | '=='
  | '==='
  | '>'
  | '>='
  | '>>'
  | '>>>'
  | '|'
  | 'in'
  | 'instanceof'

export type LineStarts = readonly number[]

export function computeLineStarts(text: string): LineStarts {
  const result: number[] = []
  let pos = 0
  let lineStart = 0
  while (pos < text.length) {
    const ch = text.charCodeAt(pos)
    pos++
    switch (ch) {
      case CharacterCodes.carriageReturn: {
        if (text.charCodeAt(pos) === CharacterCodes.lineFeed) {
          pos++
        }
        result.push(lineStart)
        lineStart = pos
        break
      }
      case CharacterCodes.lineFeed:
        result.push(lineStart)
        lineStart = pos
        break
      default:
        if (ch > CharacterCodes.maxAsciiCharacter && isLineBreak(ch)) {
          result.push(lineStart)
          lineStart = pos
        }
        break
    }
  }
  result.push(lineStart)
  return result
}

export function positionFromOffset(
  lineStarts: LineStarts,
  offset: number,
): Position {
  const lineNumber = computeLineOfPosition(lineStarts, offset)
  const lineStart = lineStarts[lineNumber]
  if (lineStart === undefined) {
    throw new Error('Line start not found for computed line number')
  }
  return {
    line: lineNumber,
    column: offset - lineStart,
  }
}

function computeLineOfPosition(
  lineStarts: LineStarts,
  offset: number,
): number {
  let lineNumber = binarySearch(lineStarts, offset)
  if (lineNumber < 0) {
    lineNumber = ~lineNumber - 1
    if (lineNumber === -1) {
      throw new Error('position cannot precede the beginning of the file')
    }
  }
  return lineNumber
}

function binarySearch(array: readonly number[], value: number): number {
  if (!array.length) {
    return -1
  }

  let low = 0
  let high = array.length - 1
  while (low <= high) {
    const middle = low + ((high - low) >> 1)
    const midValue = array[middle]
    if (midValue === undefined) {
      throw new Error('Binary search middle value is missing')
    }
    const midKey = compare(midValue, value)
    switch (midKey) {
      case -1:
        low = middle + 1
        break
      case 0:
        return middle
      case 1:
        high = middle - 1
        break
    }
  }

  return ~low
}

function compare(a: number, b: number): -1 | 0 | 1 {
  if (a < b) {
    return -1
  }
  if (a > b) {
    return 1
  }
  return 0
}
const CharacterCodes = {
  lineFeed: 0x0a,
  carriageReturn: 0x0d,
  maxAsciiCharacter: 0x7f,
  lineSeparator: 0x2028,
  paragraphSeparator: 0x2029,
} as const

function isLineBreak(ch: number): boolean {
  return (
    ch === CharacterCodes.lineFeed ||
    ch === CharacterCodes.carriageReturn ||
    ch === CharacterCodes.lineSeparator ||
    ch === CharacterCodes.paragraphSeparator
  )
}
