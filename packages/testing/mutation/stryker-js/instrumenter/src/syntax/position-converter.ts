import { type Position } from '@systemfsoftware/stryker-js-plugin-api/core'

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
      case Comparison.LessThan:
        low = middle + 1
        break
      case Comparison.EqualTo:
        return middle
      case Comparison.GreaterThan:
        high = middle - 1
        break
    }
  }

  return ~low
}
const enum Comparison {
  LessThan = -1,
  EqualTo = 0,
  GreaterThan = 1,
}
function compare(a: number, b: number) {
  return a < b
    ? Comparison.LessThan
    : a > b
    ? Comparison.GreaterThan
    : Comparison.EqualTo
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
