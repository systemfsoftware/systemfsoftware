/**
 * Syntax — the instrumenter's AST shapes, location helpers and syntax utilities.
 */
import type { Position } from '@systemfsoftware/stryker-js/Mutant'
import * as Match from 'effect/Match'
import * as Predicate from 'effect/Predicate'
import type { Program } from 'estree'
import { AstFormat as SchemaAstFormat } from './Syntax.schema.js'

export const AstFormat = SchemaAstFormat
export type AstFormat = typeof SchemaAstFormat.Type
export interface AstByFormat {
  js: JSAst
  ts: TSAst
  tsx: TsxAst
}
export type ScriptAst = JSAst | TSAst | TsxAst
export type Ast = ScriptAst

const AST_SHAPE = ['format', 'root'] as const

export function isAst(value: unknown): value is Ast {
  return Predicate.isObject(value) && AST_SHAPE.every((key) => key in value)
}

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
export interface BaseAst {
  originFileName: string
  rawContent: string
  root: Ast['root']
  offset?: Position
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
  return comparePositions(haystack.start, needle.start) <= 0 && comparePositions(haystack.end, needle.end) >= 0
}

/**
 * Determines if two locations overlap with each other
 */
export function locationOverlaps(
  a: SourceLocationInFile,
  b: SourceLocationInFile,
): boolean {
  return comparePositions(a.start, b.end) <= 0 && comparePositions(a.end, b.start) >= 0
}

/**
 * Source order of two positions: negative when `a` precedes `b`, zero when both
 * are the same position, positive when `a` follows `b`.
 */
function comparePositions(a: Position, b: Position): number {
  const lineDelta = a.line - b.line
  if (lineDelta !== 0) return lineDelta
  return a.column - b.column
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

const LINE_TERMINATOR = /\r\n|[\n\r\u2028\u2029]/g

export function computeLineStarts(text: string): LineStarts {
  const terminatorEnds = [...text.matchAll(LINE_TERMINATOR)].map((match) => match.index + match[0].length)
  return [0, ...terminatorEnds]
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
  const lastLine = lastLineStart(lineStarts, offset, 0, lineStarts.length - 1)
  if (lastLine === -1) {
    throw new Error('position cannot precede the beginning of the file')
  }
  return lastLine
}

function lastLineStart(
  array: readonly number[],
  offset: number,
  low: number,
  high: number,
): number {
  if (low > high) return low - 1
  const middle = middleIndex(low, high)
  const midValue = requireMidpoint(array[middle])
  return Match.value(midValue).pipe(
    Match.when(offset, () => middle),
    Match.when((mid) => mid < offset, () => lastLineStart(array, offset, middle + 1, high)),
    Match.orElse(() => lastLineStart(array, offset, low, middle - 1)),
  )
}

function middleIndex(low: number, high: number): number {
  return low + ((high - low) >> 1)
}

function requireMidpoint(midValue: number | undefined): number {
  if (midValue === undefined) {
    throw new Error('Binary search middle value is missing')
  }
  return midValue
}
