/**
 * The primitives every emitter uses to turn a declaration into TypeScript source text.
 *
 * Five of them were written five times over, once per emitter, and the copies had already begun to
 * diverge: the identifier regex appeared under two names in one file, the quoting function under
 * three names across four, and the doc-comment renderer in two shapes that differ only in whether a
 * one-line doc collapses. The escaping function is the reason this consolidation is not cosmetic —
 * it is the seam where a declaration's data becomes syntax, so five copies is five places for the
 * escaping of a quote or a backslash to drift apart while every gate stays green.
 *
 * Nothing is imported here. Every emitter and the term compiler import from this module, and one of
 * them is reached by dynamic import from a script that ends in a top-level `await`, so a dependency
 * pointing back at any of them would close a cycle that deadlocks rather than merely going stale.
 */

/** A TypeScript identifier: what may be written bare rather than quoted or rejected. */
export const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** Narrows an unvalidated declaration node to something with fields, excluding arrays. */
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * Refuses a declaration by name.
 *
 * `kind` prefixes the message — `declaration` for the data-description emitters, `term` for the
 * compiler — because the two authorship forms fail for different reasons and an author reading the
 * error needs to know which language rejected them. It returns `never` so a caller's narrowing
 * survives the call.
 */
export const rejecting = (kind: string) => (message: string): never => {
  throw new Error(`${kind} rejected: ${message}`)
}

/**
 * A literal, quoted and escaped for emission.
 *
 * Single quotes to match the formatter, so the emitted bytes need no re-quoting pass. Backslashes
 * are escaped before quotes, which is the order that matters: doing it the other way round escapes
 * the backslash that the quote escaping just introduced.
 */
export const literal = (v: string | number | boolean): string =>
  typeof v === 'string' ? `'${v.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'` : String(v)

/** An object key, bare where it is an identifier and quoted where it is not. */
export const key = (name: string): string => IDENT.test(name) ? name : literal(name)

/**
 * A doc comment, collapsed to one line where the doc is one line.
 *
 * A blank entry emits ` *` with no trailing space: the formatter strips a trailing space, so emitting
 * one makes the round-trip differ from the file on disk by exactly that byte.
 */
export const docBlock = (doc: readonly string[] | undefined, indent: string): string => {
  if (doc === undefined || doc.length === 0) return ''
  if (doc.length === 1) return `${indent}/** ${doc[0]} */\n`
  const lines = doc.map((line) => (line === '' ? `${indent} *` : `${indent} * ${line}`)).join('\n')
  return `${indent}/**\n${lines}\n${indent} */\n`
}
