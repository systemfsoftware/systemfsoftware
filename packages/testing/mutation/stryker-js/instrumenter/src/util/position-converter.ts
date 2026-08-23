import { type Position } from '@systemfsoftware/stryker-js-plugin-api/core'

/**
 * A class that can convert a string offset back to line / column.
 * Grabbed from TypeScript code base
 * @see https://github.com/microsoft/TypeScript/blob/aa9b6953441b53f8b14072c047f0519b611150c4/src/compiler/scanner.ts#L503
 */
export class PositionConverter {
  private _lineStarts?: readonly number[]
  private get lineStarts() {
    if (!this._lineStarts) {
      this._lineStarts = this.computeLineStarts(this.text)
    }
    return this._lineStarts
  }
  constructor(private readonly text: string) {}

  public positionFromOffset(offset: number): Position {
    const lineNumber = this.computeLineOfPosition(offset)
    const lineStart = this.lineStarts[lineNumber]
    if (lineStart === undefined) {
      throw new Error('Line start not found for computed line number')
    }
    return {
      line: lineNumber,
      column: offset - lineStart,
    }
  }

  private computeLineOfPosition(offset: number) {
    let lineNumber = binarySearch(this.lineStarts, offset)
    if (lineNumber < 0) {
      // If the actual position was not found,
      // the binary search returns the 2's-complement of the next line start
      // e.g. if the line starts at [5, 10, 23, 80] and the position requested was 20
      // then the search will return -2.
      //
      // We want the index of the previous line start, so we subtract 1.
      // Review 2's-complement if this is confusing.
      lineNumber = ~lineNumber - 1
      if (lineNumber === -1) {
        throw new Error('position cannot precede the beginning of the file')
      }
    }
    return lineNumber
  }

  private computeLineStarts(text: string): number[] {
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
  // ES5 7.3:
  // The ECMAScript line terminator characters are listed in Table 3.
  //     Table 3: Line Terminator Characters
  //     Code Unit Value     Name                    Formal Name
  //     \u000A              Line Feed               <LF>
  //     \u000D              Carriage Return         <CR>
  //     \u2028              Line separator          <LS>
  //     \u2029              Paragraph separator     <PS>
  // Only the characters in Table 3 are treated as line terminators. Other new line or line
  // breaking characters are treated as white space but not as line terminators.

  return (
    ch === CharacterCodes.lineFeed ||
    ch === CharacterCodes.carriageReturn ||
    ch === CharacterCodes.lineSeparator ||
    ch === CharacterCodes.paragraphSeparator
  )
}
