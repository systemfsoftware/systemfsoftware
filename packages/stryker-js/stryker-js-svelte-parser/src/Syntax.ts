/**
 * Syntax — the svelte shape this parser hands the host: the ranges of a
 * component's script bodies and template expressions, each with the format and
 * the text the host parses it as.
 */
import type { Position } from '@systemfsoftware/stryker-js/Mutant'

/** A half-open `[start, end)` span of offsets into the component document. */
export interface Range {
  readonly start: number
  readonly end: number
}

/** The script languages a svelte component can embed. */
export type ScriptFormat = 'js' | 'ts'

/**
 * One script body or template expression of a component. The text and the
 * format travel with the range: the host parses the text itself, because the
 * js/ts engine belongs to the host, not to a format plugin.
 */
export interface TemplateScript {
  readonly range: Range
  readonly format: ScriptFormat
  readonly content: string
  readonly isExpression: boolean
  readonly offset: Position
}

export interface SvelteRootNode {
  readonly moduleScript?: TemplateScript
  readonly additionalScripts: readonly TemplateScript[]
}

export interface SvelteAst {
  readonly originFileName: string
  readonly rawContent: string
  readonly format: 'svelte'
  readonly root: SvelteRootNode
}

export type LineStarts = readonly number[]

const LINE_TERMINATOR = /\r\n|[\n\r\u2028\u2029]/g

export function computeLineStarts(text: string): LineStarts {
  const terminatorEnds = [...text.matchAll(LINE_TERMINATOR)].map((match) => match.index + match[0].length)
  return [0, ...terminatorEnds]
}

export function positionFromOffset(lineStarts: LineStarts, offset: number): Position {
  const line = lineStarts.filter((lineStart) => lineStart <= offset).length - 1
  const lineStart = lineStarts[line]
  if (lineStart === undefined) {
    throw new Error(`No line starts at or before offset ${offset}`)
  }
  return { line: line, column: offset - lineStart }
}
