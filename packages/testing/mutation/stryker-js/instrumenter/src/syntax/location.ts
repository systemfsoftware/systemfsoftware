import { type Position } from '@systemfsoftware/stryker-js-plugin-api/core'

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
