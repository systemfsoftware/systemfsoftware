import type { SchemaError } from 'effect/Schema'

/** `["mutator"]["name"]` — the path shape a rendered schema issue carries. */
const PATH_LINE = /^at\s+(\[.*\])$/
const PATH_SEGMENT = /\["([^"]*)"\]|\[(\d+)\]/g
const EXPECTED_PATTERN = /^Expected a string matching the RegExp (.+)$/
const EXPECTED_TYPE = /^Expected (.+)$/

/** `["mutator"]["name"]` -> `mutator.name`; an index stays bracketed. */
const dottedPath = (raw: string): string => {
  let path = ''
  for (const [, key, index] of raw.matchAll(PATH_SEGMENT)) {
    if (index !== undefined) {
      path += `[${index}]`
    } else {
      path += path.length > 0 ? `.${key ?? ''}` : (key ?? '')
    }
  }
  return path
}

/** The expectation, in the phrasing an operator reading the terminal already knows. */
const phrase = (expectation: string): string => {
  const pattern = EXPECTED_PATTERN.exec(expectation)
  if (pattern !== null) return `must match pattern "${pattern[1] ?? ''}"`
  const type = EXPECTED_TYPE.exec(expectation)
  if (type !== null) return `should be ${type[1] ?? ''}`
  return expectation
}

/**
 * Renders a decode failure as one message per offending option.
 *
 * A schema issue already carries its expectation and its path, so rendering
 * one is a formatting decision over data the issue supplies — no
 * deduplication, no merging, no path reconstruction. The function names the
 * option and keeps the phrasing the CLI contract pins: an operator is told
 * which option is wrong and what it must be.
 *
 * An issue is an expectation line followed by its indented `at [...]` path. If
 * that shape ever changes, each line arrives as its own message: the phrasing
 * degrades and no information is lost.
 */
export function describeErrors(error: SchemaError): string[] {
  const messages: string[] = []
  let expectation: string | undefined
  for (const raw of error.message.split('\n')) {
    const line = raw.trim()
    if (line.length === 0) continue
    const path = PATH_LINE.exec(line)
    if (path !== null && expectation !== undefined) {
      messages.push(`Config option "${dottedPath(path[1] ?? '')}" ${phrase(expectation)}.`)
      expectation = undefined
      continue
    }
    if (expectation !== undefined) messages.push(expectation)
    expectation = line
  }
  if (expectation !== undefined) messages.push(expectation)
  return messages.length > 0 ? messages : [error.message]
}
