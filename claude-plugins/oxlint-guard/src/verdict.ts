import { parse as parseJsonc } from '@std/jsonc'
import type { ContentPair, Extractable, UnrecoverableError } from './extraction.ts'
import { err, ok } from './result.ts'
import type { Result } from './result.ts'
import { isOxlintConfigBasename } from './schemas.ts'
import type { FilePath } from './schemas.ts'

export interface AllowDecision {
  readonly _tag: 'Allow'
}

export const AllowDecision = (): AllowDecision => ({ _tag: 'Allow' })

export interface BlockDecision {
  readonly _tag: 'Block'
  readonly rules: readonly string[]
}

export const BlockDecision = (input: { readonly rules: readonly string[] }): BlockDecision => ({
  _tag: 'Block',
  rules: input.rules,
})

export interface UnrecognizedEditShapeError {
  readonly _tag: 'UnrecognizedEditShape'
  readonly reason: string
}

export const UnrecognizedEditShapeError = (input: { readonly reason: string }): UnrecognizedEditShapeError => ({
  _tag: 'UnrecognizedEditShape',
  reason: input.reason,
})

export interface UnparseableJsonError {
  readonly _tag: 'UnparseableJson'
  readonly reason: string
}

export const UnparseableJsonError = (input: { readonly reason: string }): UnparseableJsonError => ({
  _tag: 'UnparseableJson',
  reason: input.reason,
})

export type Verdict = AllowDecision | BlockDecision

export type CannotVerify = UnrecognizedEditShapeError | UnparseableJsonError

export interface DecideCommand {
  readonly targetPath: FilePath
  readonly extraction: Result<Extractable, UnrecoverableError>
}

export const DecideCommand = (input: DecideCommand): DecideCommand => input

const Allow: Verdict = AllowDecision()

const block = (rules: readonly string[]): Verdict => BlockDecision({ rules: Array.from(new Set(rules)) })

const unrecognizedShape = (reason: string): CannotVerify => UnrecognizedEditShapeError({ reason })

const unparseableJson = (reason: string): CannotVerify => UnparseableJsonError({ reason })

const configBasename = (path: string): string => path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)

const isConfigTarget = (targetPath: string): boolean => isOxlintConfigBasename(configBasename(targetPath))

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

type RulesEntries = ReadonlyArray<readonly [string, unknown]>

// Every map is read with Object.entries on the parsed value instead of being
// decoded into a record, because record decoders silently drop a key literally
// named "__proto__" — a config turning such a rule off would otherwise pass
// the guard.
const topLevelRules = (value: Record<string, unknown>): Result<RulesEntries, CannotVerify> => {
  const rules = value['rules']
  if (rules === undefined) {
    return ok([])
  }
  if (isJsonObject(rules)) {
    return ok(Object.entries(rules))
  }
  return err(unparseableJson('the config content is not a JSON object carrying a rules map'))
}

const overrideEntryRules = (entry: unknown): Result<RulesEntries | undefined, CannotVerify> => {
  if (!isJsonObject(entry)) {
    return ok(undefined)
  }
  const rules = entry['rules']
  if (rules === undefined) {
    return ok(undefined)
  }
  if (isJsonObject(rules)) {
    return ok(Object.entries(rules))
  }
  return err(unparseableJson('an overrides entry carries a rules key that is not a JSON object'))
}

// oxlint honors `overrides: [{ files, rules }]`, so a rule turned off inside an
// override is as real a silencing as one in the top-level map. Collect the
// entries of the top-level rules map AND of every overrides[].rules map.
const overrideRules = (value: Record<string, unknown>): Result<RulesEntries, CannotVerify> => {
  const overrides = value['overrides']
  if (overrides === undefined) {
    return ok([])
  }
  if (isArray(overrides)) {
    return overrides.reduce<Result<RulesEntries, CannotVerify>>(
      (acc, entry) => {
        if (!acc.ok) {
          return acc
        }
        const candidate = overrideEntryRules(entry)
        if (!candidate.ok) {
          return candidate
        }
        if (candidate.value === undefined) {
          return acc
        }
        return ok([...acc.value, ...candidate.value])
      },
      ok([]),
    )
  }
  return err(unparseableJson('the config content carries an overrides key that is not an array'))
}

const rulesEntries = (value: unknown): Result<RulesEntries, CannotVerify> => {
  if (!isJsonObject(value)) {
    return err(unparseableJson('the config content is not a JSON object carrying a rules map'))
  }
  const top = topLevelRules(value)
  if (!top.ok) {
    return top
  }
  const nested = overrideRules(value)
  if (!nested.ok) {
    return nested
  }
  return ok([...top.value, ...nested.value])
}

const parseRules = (side: string): Result<RulesEntries, CannotVerify> => {
  let parsed: unknown
  try {
    parsed = parseJsonc(side)
  } catch {
    return err(unparseableJson('the config content is not valid JSON or JSONC'))
  }
  return rulesEntries(parsed)
}

const isArray = (value: unknown): value is readonly unknown[] => Array.isArray(value)

const isZeroSeverity = (value: unknown): value is 0 => value === 0

// oxlint treats 'off', 'allow', and the numeric 0 — bare or as the first element
// of a severity array — as disabling a rule. Anything else ('deny'/'error'/
// 'warn'/1/2, bare or array-first) is an enabled severity the guard must not block.
const isOffSeverity = (value: unknown): boolean => {
  if (typeof value === 'string') {
    return value === 'off' || value === 'allow'
  }
  if (isZeroSeverity(value)) {
    return true
  }
  if (isArray(value)) {
    return value.length > 0 && isOffSeverity(value[0])
  }
  return false
}

const scanJsonPair = (pair: ContentPair): Result<readonly string[], CannotVerify> => {
  const oldEntries = pair.oldSide === undefined ? ok<RulesEntries>([]) : parseRules(pair.oldSide)
  if (!oldEntries.ok) {
    return oldEntries
  }
  const newEntries = parseRules(pair.newSide)
  if (!newEntries.ok) {
    return newEntries
  }
  const oldByName = new Map(oldEntries.value)
  return ok(
    newEntries.value
      .filter(([name, severity]) => isOffSeverity(severity) && !isOffSeverity(oldByName.get(name)))
      .map(([name]) => name),
  )
}

// Matches a rule-severity declaration: a quoted or bare rule key, colon, then a
// disabled severity — 'off', 'allow', or 0 — bare or as the first element of a
// severity array. Only scanned within brace-matched rules-map spans (see
// ruleSpansOf), never across the whole module source. Comments are stripped
// before matching. Deliberately does NOT catch: 'off' spelled through a
// variable, template literal, or imported/spread rule object, or any severity
// outside a literal `key: severity` position — the guard scans literal syntax only.
const RULE_OFF_PATTERN =
  /((?:"[^"'\n]+"|'[^"'\n]+'|[A-Za-z_$@][\w$@.-]*))\s*:\s*(?:\[\s*)?(?:"off"|'off'|"allow"|'allow'|0)(?![\d.])/g

const stripComments = (source: string): string =>
  source.replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g,
    (match) => (match.startsWith('/') ? '' : match),
  )

// Neutralize braces inside string and template literals (keeping their length and
// contents otherwise intact) so a string can neither fake a `rules: {` opener nor
// distort the brace matching below. Quoted property keys like 'rules' stay
// readable because their contents are preserved.
const maskBracesInStrings = (source: string): string =>
  source.replace(
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g,
    (match) => match.replace(/[{}]/g, 'x'),
  )

const BRACE_DELTAS: Readonly<Record<string, number>> = { '{': 1, '}': -1 }

const braceDelta = (char: string): number => BRACE_DELTAS[char] ?? 0

// Running brace balance after each character following the opening brace at
// openIndex; the first later index whose balance returns to 0 is the matching close.
const braceBalances = (masked: string, openIndex: number): readonly number[] =>
  Array.from(masked.slice(openIndex + 1)).reduce<readonly number[]>(
    (acc, char) => [...acc, (acc[acc.length - 1] ?? 0) + braceDelta(char)],
    [1],
  )

const matchBraceClose = (masked: string, openIndex: number): number | undefined => {
  const index = braceBalances(masked, openIndex).findIndex((balance, position) => position > 0 && balance === 0)
  if (index === -1) {
    return undefined
  }
  return openIndex + index
}

// Every `rules:` map opener: the property name rules (bare or quoted), a colon,
// and the opening brace, preceded by a token boundary so `configuredRules: {`
// cannot open a span. Matched over the masked source, where braces inside
// strings are neutralized, so a `rules: {` inside a string cannot either.
const RULES_MAP_OPENER = /(?:^|[{,;\s])(?:["']?rules["']?)\s*:\s*\{/g

const openerBraceOf = (match: RegExpMatchArray): number => (match.index ?? 0) + match[0].length - 1

// Brace-matched spans of every rules map in the source — the top-level map and
// each overrides[].rules map alike. An opener whose braces never close yields no
// span: a span that cannot be located is scanned as nothing, never as the whole file.
const ruleSpansOf = (masked: string): ReadonlyArray<readonly [number, number]> =>
  Array.from(masked.matchAll(RULES_MAP_OPENER)).flatMap((match) => {
    const open = openerBraceOf(match)
    const close = matchBraceClose(masked, open)
    if (close === undefined) {
      return []
    }
    return [[open, close] as const]
  })

const offRulesIn = (source: string): readonly string[] => {
  const masked = maskBracesInStrings(source)
  return ruleSpansOf(masked).flatMap(([from, to]) =>
    Array.from(
      source.slice(from, to + 1).matchAll(RULE_OFF_PATTERN),
      (match) => (match[1] ?? '').replace(/^["']|["']$/g, ''),
    )
  )
}

const scanModulePair = (pair: ContentPair): readonly string[] => {
  const oldOff = offRulesIn(stripComments(pair.oldSide ?? ''))
  const newOff = offRulesIn(stripComments(pair.newSide))
  return newOff.filter((name) => !oldOff.includes(name))
}

const scanPair = (isJson: boolean, pair: ContentPair): Result<readonly string[], CannotVerify> =>
  isJson ? scanJsonPair(pair) : ok(scanModulePair(pair))

const decidePairs = (isJson: boolean, pairs: readonly ContentPair[]): Result<Verdict, CannotVerify> => {
  const rules = pairs.reduce<Result<readonly string[], CannotVerify>>(
    (acc, pair) => {
      if (!acc.ok) {
        return acc
      }
      const scanned = scanPair(isJson, pair)
      if (!scanned.ok) {
        return scanned
      }
      return ok([...acc.value, ...scanned.value])
    },
    ok([]),
  )
  if (!rules.ok) {
    return rules
  }
  if (rules.value.length === 0) {
    return ok(Allow)
  }
  return ok(block(rules.value))
}

export const decideOnConfig = (input: DecideCommand): Result<Verdict, CannotVerify> => {
  if (!input.extraction.ok) {
    return err(unrecognizedShape(input.extraction.error.reason))
  }
  const extractable = input.extraction.value
  switch (extractable._tag) {
    case 'Contentless':
      return ok(Allow)
    case 'Pairs':
      return decidePairs(configBasename(input.targetPath).endsWith('.json'), extractable.pairs)
  }
}

export const decide = (input: DecideCommand): Result<Verdict, CannotVerify> =>
  isConfigTarget(input.targetPath) ? decideOnConfig(input) : ok(Allow)
