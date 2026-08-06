import { parse as parseJsonc } from '@std/jsonc'
import * as Either from 'effect/Either'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import { OxlintConfigBasename } from '../edit-command.schema.js'
import type { ContentPair } from './extraction.workflow.js'
import { DecideCommand } from './verdict-command.schema.js'

type Workflow<Command, Decision, Error> = (command: Command) => Either.Either<Decision, Error>

const VerdictTypeId: unique symbol = Symbol.for('@systemfsoftware/oxlint-guard/Verdict')
type VerdictTypeId = typeof VerdictTypeId

export class AllowDecision extends S.TaggedClass<AllowDecision>()('Allow', {}) {
  readonly [VerdictTypeId] = VerdictTypeId
}

export class BlockDecision extends S.TaggedClass<BlockDecision>()('Block', {
  rules: S.Array(S.String),
}) {
  readonly [VerdictTypeId] = VerdictTypeId
}

export class UnrecognizedEditShapeError extends S.TaggedError<UnrecognizedEditShapeError>()('UnrecognizedEditShape', {
  reason: S.String,
}) {
  readonly [VerdictTypeId] = VerdictTypeId
}

export class UnparseableJsonError extends S.TaggedError<UnparseableJsonError>()('UnparseableJson', {
  reason: S.String,
}) {
  readonly [VerdictTypeId] = VerdictTypeId
}

export const VerdictSchema = S.Union(AllowDecision, BlockDecision)
export type Verdict = S.Schema.Type<typeof VerdictSchema>

export const CannotVerifySchema = S.Union(UnrecognizedEditShapeError, UnparseableJsonError)
export type CannotVerify = S.Schema.Type<typeof CannotVerifySchema>

const Allow: Verdict = new AllowDecision()

const block = (rules: readonly string[]): Verdict => new BlockDecision({ rules: Array.from(new Set(rules)) })

const unrecognizedShape = (reason: string): CannotVerify => new UnrecognizedEditShapeError({ reason })

const unparseableJson = (reason: string): CannotVerify => new UnparseableJsonError({ reason })

const configBasename = (path: string): string => path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)

const isConfigTarget = (targetPath: string): boolean => S.is(OxlintConfigBasename)(configBasename(targetPath))

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

type RulesEntries = ReadonlyArray<readonly [string, unknown]>

// Every map is read with Object.entries on the parsed value instead of being
// decoded into a record, because record decoders silently drop a key literally
// named "__proto__" — a config turning such a rule off would otherwise pass
// the guard.
const topLevelRules = (value: Record<string, unknown>): Either.Either<RulesEntries, CannotVerify> =>
  Match.value({ rules: value['rules'] }).pipe(
    Match.when({ rules: undefined }, () => Either.right([])),
    Match.when({ rules: isJsonObject }, ({ rules }) => Either.right(Object.entries(rules))),
    Match.orElse(() => Either.left(unparseableJson('the config content is not a JSON object carrying a rules map'))),
  )

const overrideEntryRules = (entry: unknown): Either.Either<Option.Option<RulesEntries>, CannotVerify> =>
  Match.value({ entry }).pipe(
    Match.when({ entry: isJsonObject }, ({ entry }) =>
      Match.value({ rules: entry['rules'] }).pipe(
        Match.when({ rules: undefined }, () => Either.right(Option.none())),
        Match.when({ rules: isJsonObject }, ({ rules }) => Either.right(Option.some(Object.entries(rules)))),
        Match.orElse(() =>
          Either.left(unparseableJson('an overrides entry carries a rules key that is not a JSON object'))
        ),
      )),
    Match.orElse(() => Either.right(Option.none())),
  )

// oxlint honors `overrides: [{ files, rules }]`, so a rule turned off inside an
// override is as real a silencing as one in the top-level map. Collect the
// entries of the top-level rules map AND of every overrides[].rules map.
const overrideRules = (value: Record<string, unknown>): Either.Either<RulesEntries, CannotVerify> =>
  Match.value({ overrides: value['overrides'] }).pipe(
    Match.when({ overrides: undefined }, () => Either.right([])),
    Match.when({ overrides: isArray }, ({ overrides }) =>
      overrides.reduce<Either.Either<RulesEntries, CannotVerify>>(
        (acc, entry) =>
          acc.pipe(
            Either.flatMap((entries) =>
              overrideEntryRules(entry).pipe(
                Either.map((candidate) =>
                  Option.match(candidate, {
                    onNone: () => entries,
                    onSome: (entryEntries) => [...entries, ...entryEntries],
                  })
                ),
              )
            ),
          ),
        Either.right<RulesEntries>([]),
      )),
    Match.orElse(() =>
      Either.left(unparseableJson('the config content carries an overrides key that is not an array'))
    ),
  )

const rulesEntries = (value: unknown): Either.Either<RulesEntries, CannotVerify> =>
  Match.value({ value }).pipe(
    Match.when({ value: isJsonObject }, ({ value }) =>
      Either.zipWith(topLevelRules(value), overrideRules(value), (top, nested) => [...top, ...nested])),
    Match.orElse(() =>
      Either.left(unparseableJson('the config content is not a JSON object carrying a rules map'))
    ),
  )

const parseRules = (side: string): Either.Either<RulesEntries, CannotVerify> =>
  Either.try({
    try: (): unknown => parseJsonc(side),
    catch: () => unparseableJson('the config content is not valid JSON or JSONC'),
  }).pipe(Either.flatMap(rulesEntries))

const isArray = (value: unknown): value is readonly unknown[] => Array.isArray(value)

const isZeroSeverity = (value: unknown): value is 0 => value === 0

// oxlint treats 'off', 'allow', and the numeric 0 — bare or as the first element
// of a severity array — as disabling a rule. Anything else ('deny'/'error'/
// 'warn'/1/2, bare or array-first) is an enabled severity the guard must not block.
const isOffSeverity = (value: unknown): boolean =>
  Match.value({ value }).pipe(
    Match.when({ value: Match.string }, ({ value }) => value === 'off' || value === 'allow'),
    Match.when({ value: isZeroSeverity }, () => true),
    Match.when({ value: isArray }, ({ value }) => value.length > 0 && isOffSeverity(value[0])),
    Match.orElse(() => false),
  )

const scanJsonPair = (pair: ContentPair): Either.Either<readonly string[], CannotVerify> =>
  Either.zipWith(
    Option.match(pair.oldSide, {
      onNone: () => Either.right<RulesEntries>([]),
      onSome: parseRules,
    }),
    parseRules(pair.newSide),
    (oldEntries, newEntries) => {
      const oldByName = new Map(oldEntries)
      return newEntries
        .filter(([name, severity]) => isOffSeverity(severity) && !isOffSeverity(oldByName.get(name)))
        .map(([name]) => name)
    },
  )

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
    (match) =>
      Match.value({ isComment: match.startsWith('/') }).pipe(
        Match.when({ isComment: true }, () => ''),
        Match.orElse(() => match),
      ),
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

const matchBraceClose = (masked: string, openIndex: number): Option.Option<number> =>
  Option.fromNullable(
    braceBalances(masked, openIndex).findIndex((balance, index) => index > 0 && balance === 0),
  ).pipe(
    Option.filter((index) => index !== -1),
    Option.map((index) => openIndex + index),
  )

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
    return Option.match(matchBraceClose(masked, open), {
      onNone: () => [],
      onSome: (close) => [[open, close] as const],
    })
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
  const oldOff = offRulesIn(stripComments(Option.getOrElse(pair.oldSide, () => '')))
  const newOff = offRulesIn(stripComments(pair.newSide))
  return newOff.filter((name) => !oldOff.includes(name))
}

const scanPair = (isJson: boolean, pair: ContentPair): Either.Either<readonly string[], CannotVerify> =>
  Match.value({ isJson }).pipe(
    Match.when({ isJson: true }, () => scanJsonPair(pair)),
    Match.orElse(() => Either.right(scanModulePair(pair))),
  )

const decidePairs = (isJson: boolean, pairs: readonly ContentPair[]): Either.Either<Verdict, CannotVerify> =>
  Either.map(
    pairs.reduce<Either.Either<readonly string[], CannotVerify>>(
      (acc, pair) =>
        acc.pipe(
          Either.flatMap((rules) => scanPair(isJson, pair).pipe(Either.map((more) => [...rules, ...more]))),
        ),
      Either.right([]),
    ),
    (rules) =>
      Match.value({ empty: rules.length === 0 }).pipe(
        Match.when({ empty: true }, () => Allow),
        Match.orElse(() => block(rules)),
      ),
  )

const decideOnConfig = (input: DecideCommand): Either.Either<Verdict, CannotVerify> =>
  Either.match(input.extraction, {
    onLeft: (error) => Either.left(unrecognizedShape(error.reason)),
    onRight: (extractable) =>
      Match.value(extractable).pipe(
        Match.tag('Contentless', () => Either.right(Allow)),
        Match.tag('Pairs', ({ pairs }) => decidePairs(configBasename(input.targetPath).endsWith('.json'), pairs)),
        Match.exhaustive,
      ),
  })

export const decide: Workflow<DecideCommand, Verdict, CannotVerify> = (
  input: DecideCommand,
): Either.Either<Verdict, UnrecognizedEditShapeError | UnparseableJsonError> =>
  isConfigTarget(input.targetPath) ? decideOnConfig(input) : Either.right(Allow)
