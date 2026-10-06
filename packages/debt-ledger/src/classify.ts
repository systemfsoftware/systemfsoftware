import type { OptIn, ThirdPartyPatch } from '@systemfsoftware/opt-in'
import { Array as Arr, Match, Option, Schema } from 'effect'
import { dual } from 'effect/Function'
import {
  ConfigSeverity,
  Declared,
  type DeclaredGrant,
  type Entry,
  Marker,
  MarkerTag,
  type Patch,
  Stale,
  type Status,
  Undeclared,
} from './Entry.schema.js'

export interface GrantOwner {
  readonly name: string
  readonly reason: string
  readonly owner: string
  readonly recheck?: string
}

export interface OptInWithPackage {
  readonly package: string
  readonly optIn: OptIn
}

export interface JoinIndex {
  readonly configDeclarations: ReadonlyMap<string, GrantOwner>
  readonly patchDeclarations: ReadonlyMap<string, GrantOwner>
  readonly matchedGrants: ReadonlySet<string>
}

export interface JoinInput {
  readonly configEntries: ReadonlyArray<ConfigSeverity>
  readonly grants: ReadonlyArray<OptInWithPackage>
  readonly patches: ReadonlyArray<Patch>
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

const patchKeyOf = (dependency: string, patch: string): string => `${dependency}\u0000${patch}`

const thirdPartyPatch = (optIn: OptIn): Option.Option<ThirdPartyPatch> =>
  Match.value(optIn.grant).pipe(
    Match.tag('ThirdPartyPatch', (grant) => Option.some(grant)),
    Match.orElse(() => Option.none()),
  )

const ownerOf = (optIn: OptIn): GrantOwner => ({
  name: optIn.name,
  reason: optIn.reason,
  owner: optIn.owner,
})

const patchOwnerOf = (optIn: OptIn): GrantOwner =>
  Option.match(thirdPartyPatch(optIn), {
    onNone: () => ownerOf(optIn),
    onSome: (grant) => ({ ...ownerOf(optIn), recheck: grant.recheck }),
  })

const grantMatchesPatch = (optIn: OptIn, patch: Patch): boolean =>
  Option.match(thirdPartyPatch(optIn), {
    onNone: () => false,
    onSome: (grant) => patchKeyOf(grant.dependency, grant.patch) === patchKeyOf(patch.dependency, patch.patch),
  })

export const joinGrants = (input: JoinInput): JoinIndex => {
  const configDeclarations = new Map<string, GrantOwner>()
  const patchDeclarations = new Map<string, GrantOwner>()
  const matchedGrants = new Set<string>()
  Arr.forEach(input.grants, ({ package: pkg, optIn }) => {
    const matchingConfig = Arr.filter(input.configEntries, (entry) => grantMatchesConfig(optIn, entry))
    Arr.forEach(matchingConfig, (entry) => configDeclarations.set(configKeyOf(entry), ownerOf(optIn)))
    const matchingPatches = Arr.filter(input.patches, (patch) => grantMatchesPatch(optIn, patch))
    Arr.forEach(
      matchingPatches,
      (patch) => patchDeclarations.set(patchKeyOf(patch.dependency, patch.patch), patchOwnerOf(optIn)),
    )
    Arr.match([...matchingConfig, ...matchingPatches], {
      onEmpty: () => undefined,
      onNonEmpty: () => {
        matchedGrants.add(grantKeyOf(pkg, optIn.name, optIn.grant._tag))
      },
    })
  })
  return { configDeclarations, patchDeclarations, matchedGrants }
}

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

const declaredOf = (grant: DeclaredGrant): Declared =>
  Declared.make({ name: grant.name, reason: grant.reason, owner: grant.owner })

const joinedGrant = (grant: DeclaredGrant): boolean =>
  Match.value(grant.variant).pipe(
    Match.when('OxlintRule', () => true),
    Match.when('OxlintExclusion', () => true),
    Match.when('DiagnosticExclusion', () => true),
    Match.when('ThirdPartyPatch', () => true),
    Match.orElse(() => false),
  )

const grantStatus = (grant: DeclaredGrant, index: JoinIndex): Status =>
  Match.value(grant).pipe(
    Match.when((candidate) => !joinedGrant(candidate), declaredOf),
    Match.when(
      (candidate) => index.matchedGrants.has(grantKeyOf(candidate.package, candidate.name, candidate.variant)),
      declaredOf,
    ),
    Match.orElse(() => Stale.make({ why: 'the declaration authorizes no config entry or third-party patch' })),
  )

const patchStatus = (patch: Patch, index: JoinIndex): Status =>
  Option.match(Option.fromNullishOr(index.patchDeclarations.get(patchKeyOf(patch.dependency, patch.patch))), {
    onNone: () => Undeclared.make({ why: 'a third-party patch is declared only by a matching opt-in' }),
    onSome: (owner) => Declared.make(owner),
  })

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
      Match.tag('Patch', (patch) => patchStatus(patch, index)),
      Match.orElse(() => Undeclared.make({ why: 'inline suppressions and skipped tests are never declarable' })),
    ),
)

export const decodeMarkerTag = (value: string): Option.Option<MarkerTag> =>
  Option.flatMap(
    Option.fromNullishOr(/\b(TODO|FIXME|HACK|XXX)\b/.exec(value)),
    (match) => Option.flatMap(Option.fromNullishOr(match[1]), (tag) => Schema.decodeUnknownOption(MarkerTag)(tag)),
  )
