import { Array as Arr, Match } from 'effect'
import { type Entry, RustAttribute, type RustAttributeName } from './Entry.schema.js'
import { lineAt } from './text.js'

// A tiny lexer blanks string literals (including raw `r#"..."#` and `br##"..."##`),
// char literals and comments before attribute detection, so `#[allow(x)]` inside
// them is not an entry. Masking preserves every offset, so line numbers survive.
const maskChar = (char: string): string => (char === '\n' ? '\n' : ' ')

const pushMasked = (out: Array<string>, source: string, from: number, to: number): void => {
  for (let index = from; index < to; index += 1) out.push(maskChar(source.charAt(index)))
}

const normalStep = (source: string, index: number, out: Array<string>): number => {
  out.push(source.charAt(index))
  return index + 1
}

const lineCommentEnd = (source: string, from: number): number => {
  const at = source.indexOf('\n', from)
  return at === -1 ? source.length : at
}

interface BlockState {
  index: number
  depth: number
}

const blockContinues = (state: BlockState, length: number): boolean => state.depth > 0 && state.index < length

const blockAdvance = (source: string, state: BlockState): void =>
  Match.value(`${source.charAt(state.index)}${source.charAt(state.index + 1)}`).pipe(
    Match.when('/*', () => {
      state.depth += 1
      state.index += 2
    }),
    Match.when('*/', () => {
      state.depth -= 1
      state.index += 2
    }),
    Match.orElse(() => {
      state.index += 1
    }),
  )

const blockCommentEnd = (source: string, from: number): number => {
  const state: BlockState = { index: from, depth: 1 }
  while (blockContinues(state, source.length)) blockAdvance(source, state)
  return state.index
}

interface QuoteState {
  index: number
}

const quotedContinues = (source: string, state: QuoteState, quote: string): boolean =>
  state.index < source.length && source.charAt(state.index) !== quote

const quotedAdvance = (source: string, state: QuoteState): void => {
  state.index += source.charAt(state.index) === '\\' ? 2 : 1
}

const quotedEnd = (source: string, from: number, quote: string): number => {
  const state: QuoteState = { index: from + 1 }
  while (quotedContinues(source, state, quote)) quotedAdvance(source, state)
  return Math.min(state.index + 1, source.length)
}

const isCharStart = (source: string, index: number): boolean =>
  source.charAt(index + 1) === '\\' || source.charAt(index + 2) === "'"

const singleKind = (source: string, index: number): string => isCharStart(source, index) ? 'char' : 'lifetime'

const singleStep = (source: string, index: number, out: Array<string>): number =>
  Match.value(singleKind(source, index)).pipe(
    Match.when('char', () => {
      const end = quotedEnd(source, index, "'")
      pushMasked(out, source, index, end)
      return end
    }),
    Match.orElse(() => normalStep(source, index, out)),
  )

const rawHashCount = (source: string, index: number): number => {
  let cursor = index + 1
  while (source.charAt(cursor) === '#') cursor += 1
  return cursor
}

const rawHashes = (source: string, index: number): number =>
  source.charAt(rawHashCount(source, index)) === '"' ? rawHashCount(source, index) - index - 1 : -1

const rawEnd = (source: string, index: number, hashes: number): number => {
  const closer = `"${'#'.repeat(hashes)}`
  const at = source.indexOf(closer, index + hashes + 2)
  return at === -1 ? source.length : at + closer.length
}

const rawStep = (source: string, index: number, out: Array<string>): number =>
  Match.value(rawHashes(source, index)).pipe(
    Match.when(-1, () => normalStep(source, index, out)),
    Match.orElse((hashes) => {
      const end = rawEnd(source, index, hashes)
      pushMasked(out, source, index, end)
      return end
    }),
  )

const slashStep = (source: string, index: number, out: Array<string>): number =>
  Match.value(source.charAt(index + 1)).pipe(
    Match.when('/', () => {
      const end = lineCommentEnd(source, index)
      pushMasked(out, source, index, end)
      return end
    }),
    Match.when('*', () => {
      const end = blockCommentEnd(source, index + 2)
      pushMasked(out, source, index, end)
      return end
    }),
    Match.orElse(() => normalStep(source, index, out)),
  )

const maskStep = (source: string, index: number, out: Array<string>): number =>
  Match.value(source.charAt(index)).pipe(
    Match.when('/', () => slashStep(source, index, out)),
    Match.when('"', () => {
      const end = quotedEnd(source, index, '"')
      pushMasked(out, source, index, end)
      return end
    }),
    Match.when("'", () => singleStep(source, index, out)),
    Match.when('r', () => rawStep(source, index, out)),
    Match.orElse(() => normalStep(source, index, out)),
  )

const maskSource = (source: string): string => {
  const out: Array<string> = []
  let index = 0
  while (index < source.length) index = maskStep(source, index, out)
  return out.join('')
}

const ATTRIBUTE = /#\[\s*(allow|expect)\s*\(\s*([^)]*?)\s*\)\s*\]|#\[\s*ignore\s*\]/g

const ALLOW: RustAttributeName = 'allow'
const EXPECT: RustAttributeName = 'expect'

const attributeName = (raw: string): RustAttributeName => raw === 'expect' ? EXPECT : ALLOW

const textAt = (value: string | undefined): string => value ?? ''

const lineOfMatch = (source: string, match: RegExpMatchArray): number => lineAt(source, match.index ?? 0)

const ignoreEntry = (file: string, source: string, match: RegExpMatchArray): ReadonlyArray<Entry> => [
  RustAttribute.make({ file, line: lineOfMatch(source, match), attribute: 'ignore', path: '' }),
]

const namedEntry = (
  file: string,
  source: string,
  match: RegExpMatchArray,
  raw: string,
): ReadonlyArray<Entry> => [
  RustAttribute.make({
    file,
    line: lineOfMatch(source, match),
    attribute: attributeName(raw),
    path: textAt(match[2]),
  }),
]

const attributeEntry = (file: string, source: string, match: RegExpMatchArray): ReadonlyArray<Entry> =>
  Match.value(match[1]).pipe(
    Match.when((raw): raw is string => raw !== undefined, (raw) => namedEntry(file, source, match, raw)),
    Match.orElse(() => ignoreEntry(file, source, match)),
  )

const attributesOf = (file: string, source: string, masked: string): ReadonlyArray<Entry> =>
  Arr.flatMap([...masked.matchAll(ATTRIBUTE)], (match) => attributeEntry(file, source, match))

export interface RustFile {
  readonly file: string
  readonly source: string
}

export const scanRustFile = (input: RustFile): ReadonlyArray<Entry> =>
  attributesOf(input.file, input.source, maskSource(input.source))
