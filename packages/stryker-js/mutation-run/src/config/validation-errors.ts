import type { SchemaError } from 'effect/Schema'

/**
 * Renders a decode failure as one message per offending option.
 *
 * This replaced roughly two hundred lines that existed to make a JSON Schema
 * engine's error objects readable: they deduplicated errors shadowing each other
 * on one path, merged the several type errors a union produced for a single
 * option, and rebuilt the option's path by hand. The schema error already
 * carries a rendered message with the path attached, so none of that survives —
 * the only work left is splitting the render back into one entry per issue, so
 * each reaches the log on its own line as before.
 *
 * An issue starts at a column-zero line; the indented lines beneath it belong to
 * it. If that shape ever changes, the whole render arrives as a single entry:
 * the presentation degrades, and no information is lost.
 */
export function describeErrors(error: SchemaError): string[] {
  const entries: string[] = []
  for (const line of error.message.split('\n')) {
    if (line.trim().length === 0) continue
    if (/^\s/.test(line) && entries.length > 0) {
      entries[entries.length - 1] = `${entries[entries.length - 1]} ${line.trim()}`
      continue
    }
    entries.push(line.trim())
  }
  return entries.length > 0 ? entries : [error.message]
}
