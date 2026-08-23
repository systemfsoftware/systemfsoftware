import { type Position } from '@systemfsoftware/stryker-js-plugin-api/core'

export class ParseError extends Error {
  constructor(message: string, fileName: string, location: Position) {
    super(
      `Parse error in ${fileName} (${location.line}:${location.column}) ${message}`,
    )
  }
}
