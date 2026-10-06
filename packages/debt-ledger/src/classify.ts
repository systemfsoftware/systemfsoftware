import type { OptIn } from '@systemfsoftware/opt-in'
import { Array as Arr, Match, Option, Schema } from 'effect'
import { dual } from 'effect/Function'
import {
  ConfigSeverity,
  Declared,
  type DeclaredGrant,
  type Entry,
  Marker,
  MarkerTag,
  Stale,
  type Status,
  Undeclared,
} from './Entry.schema.js'

export interface GrantOwner {
  readonly name: string
  readonly reason: string
  readonly owner: string
}

export interface OptInWithPackage {
  readonly package: string
  readonly optIn: OptIn
}

export interface JoinIndex {
  readonly configDeclarations: ReadonlyMap<string, GrantOwner>
  readonly matchedGrants: ReadonlySet<string>
}

const configKeyOf = (entry: ConfigSeverity): string =>
  [entry.channel, entry.scope, entry.role ?? '', [...entry.files].join(',')].join('\u0000')

const grantKeyOf = (pkg: string, name: string, variant: string): string => [pkg, name, variant].join('\u0000')

const isWildcard = (file: string): boolean => file === '*' || file.includes('**')

const sameFile = (left: string, right: string): boolean =>
  Arr.some([left, right], (file) => isWildcard(file)) || left === right

const overlaps = (left: readonly string[], right: readonly string[]): boolean =>
  Arr.some(left, (a) => Arr.some(right, (b) => sameFile(a, b)))

const eitherEmpty = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === 0 || right.length === 0

const filesOverlap = (left: readonly string[], right: readonly string[]): boolean =>
  eitherEmpty(left, right) || overlaps(left, right)

const oxlintMatches = (entry: ConfigSeverity, rule: string, files: readonly string[]): boolean =>
  Match.value(entry).pipe(
    Match.when((candidate) => candidate.channel !== 'oxlint-rule', () => false),
    Match.when((candidate) => candidate.scope !== rule, () => false),
    Match.orElse((candidate) => filesOverlap(files, candidate.files)),
  )

const diagnosticMatches = (
  entry: ConfigSeverity,
  diagnostic: string,
  role: string,
  files: readonly string[],
): boolean =>
  Match.value(entry).pipe(
    Match.when((candidate) => candidate.channel !== 'tsgo-diagnostic', () => false),
    Match.when((candidate) => candidate.scope !== diagnostic, () => false),
    Match.when((candidate) => candidate.role !== role, () => false),
    Match.orElse((candidate) => filesOverlap(files, candidate.files)),
  )

const grantMatchesConfig = (optIn: OptIn, entry: ConfigSeverity): boolean =>
  Match.value(optIn.grant).pipe(
    Match.tag('OxlintRule', (grant) => oxlintMatches(entry, grant.rule, grant.files)),
    Match.tag('OxlintExclusion', (grant) => oxlintMatches(entry, grant.rule, grant.files)),
    Match.tag('DiagnosticExclusion', (grant) => diagnosticMatches(entry, grant.diagnostic, grant.role, grant.files)),
    Match.orElse(() => false),
  )

const ownerOf = (optIn: OptIn): GrantOwner => ({
  name: optIn.name,
  reason: optIn.reason,
  owner: optIn.owner,
})

export const joinGrants = dual<
  (grants: ReadonlyArray<OptInWithPackage>) => (configEntries: ReadonlyArray<ConfigSeverity>) => JoinIndex,
  (configEntries: ReadonlyArray<ConfigSeverity>, grants: ReadonlyArray<OptInWithPackage>) => JoinIndex
>(
  2,
  (configEntries, grants) => {
    const configDeclarations = new Map<string, GrantOwner>()
    const matchedGrants = new Set<string>()
    Arr.forEach(grants, ({ package: pkg, optIn }) => {
      const matching = Arr.filter(configEntries, (entry) => grantMatchesConfig(optIn, entry))
      Arr.forEach(matching, (entry) => configDeclarations.set(configKeyOf(entry), ownerOf(optIn)))
      Arr.match(matching, {
        onEmpty: () => undefined,
        onNonEmpty: () => matchedGrants.add(grantKeyOf(pkg, optIn.name, optIn.grant._tag)),
      })
    })
    return { configDeclarations, matchedGrants }
  },
)

const MARKER_DECLARED = /^(TODO)\((@[A-Za-z0-9][A-Za-z0-9-]{0,38})\):\s*(\S[\s\S]*)$/

const declaredMarker = (text: string): Option.Option<{ readonly owner: string; readonly reason: string }> =>
  Option.flatMap(
    Option.fromNullishOr(MARKER_DECLARED.exec(text.trim())),
    (match) => Option.map(Option.fromNullishOr(match[2]), (reason) => ({ owner: match[1] ?? '', reason })),
  )

const markerStatus = (marker: Marker): Status =>
  Option.match(declaredMarker(marker.text), {
    onNone: () => Undeclared.make({ why: 'a marker is declared only as TODO(@owner): reason' }),
    onSome: ({ owner, reason }) => Declared.make({ name: marker.tag, reason, owner }),
  })

const grantStatus = (grant: DeclaredGrant, index: JoinIndex): Status =>
  index.matchedGrants.has(grantKeyOf(grant.package, grant.name, grant.variant))
    ? Declared.make({ name: grant.name, reason: grant.reason, owner: grant.owner })
    : Stale.make({ why: 'the declaration authorizes no config entry' })

const configStatus = (entry: ConfigSeverity, index: JoinIndex): Status =>
  Option.match(Option.fromNullishOr(index.configDeclarations.get(configKeyOf(entry))), {
    onNone: () => Undeclared.make({ why: 'a config severity is declared only by a matching opt-in' }),
    onSome: (owner) => Declared.make(owner),
  })

export const classify = dual<
  (index: JoinIndex) => (entry: Entry) => Status,
  (entry: Entry, index: JoinIndex) => Status
>(
  2,
  (entry, index) =>
    Match.value(entry).pipe(
      Match.tag('ConfigSeverity', (config) => configStatus(config, index)),
      Match.tag('Grant', (grant) => grantStatus(grant, index)),
      Match.tag('Marker', (marker) => markerStatus(marker)),
      Match.orElse(() => Undeclared.make({ why: 'inline suppressions and skipped tests are never declarable' })),
    ),
)

export const decodeMarkerTag = (value: string): Option.Option<MarkerTag> =>
  Option.flatMap(
    Option.fromNullishOr(/\b(TODO|FIXME|HACK|XXX)\b/.exec(value)),
    (match) => Option.flatMap(Option.fromNullishOr(match[1]), (tag) => Schema.decodeUnknownOption(MarkerTag)(tag)),
  )
