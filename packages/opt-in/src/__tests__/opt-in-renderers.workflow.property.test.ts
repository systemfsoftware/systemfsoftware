import { it } from '@systemfsoftware/vitest'
import { Array as Arr, Match, Result, Schema } from 'effect'
import type { EffectPluginBlock } from '../EffectPluginBlock.schema.js'
import type { Raw } from '../json.js'
import { optIn } from '../optIn.js'
import { DiagnosticExclusion, Grant, OxlintExclusion, OxlintRule } from '../OptIn.schema.js'
import type { OptIn } from '../OptIn.schema.js'
import { renderEffectPlugin } from '../renderEffectPlugin.js'
import { oxlintExcludeFiles, oxlintOverrides } from '../renderOxlint.js'

const BASE: EffectPluginBlock = {
  name: '@effect/language-service',
  diagnosticSeverity: { globalDate: 'error', effectInFailure: 'error' },
  allowedUnstableApis: ['@effect/base'],
  keyPatterns: [],
}

const asOptIn = (grant: Grant): OptIn =>
  Result.getOrThrow(
    optIn({ name: 'renderer-case', owner: '@valid-owner', reason: 'a sufficiently long reason', grant }),
  )

const sameStrings = (left: ReadonlyArray<string> | undefined, right: ReadonlyArray<string> | undefined): boolean =>
  left?.length === right?.length && (left ?? []).every((value, index) => value === right?.[index])

const sameValues = (left: ReadonlyArray<Raw> | undefined, right: ReadonlyArray<Raw> | undefined): boolean =>
  left?.length === right?.length && (left ?? []).every((value, index) => Object.is(value, right?.[index]))

const isSortedUnique = (values: ReadonlyArray<string>): boolean =>
  values.every((value, index) => index === 0 || (values[index - 1] ?? '') < value)

const includes = (values: ReadonlyArray<string> | undefined, value: string): boolean => (values ?? []).includes(value)

const overrideOf = (grant: OxlintRule) => oxlintOverrides([asOptIn(grant)])

const renderLibraryOf = (grant: Grant): EffectPluginBlock => renderEffectPlugin('library', BASE, [asOptIn(grant)])

const renderPair = (first: Grant, second: Grant): EffectPluginBlock =>
  renderEffectPlugin('library', BASE, [asOptIn(first), asOptIn(second)])

const excludesFor = (grants: ReadonlyArray<OxlintExclusion>, rule: string): ReadonlyArray<string> =>
  oxlintExcludeFiles(grants.map(asOptIn), rule)

const renderBothRoles = (
  grant: DiagnosticExclusion,
): { readonly library: EffectPluginBlock; readonly test: EffectPluginBlock } => {
  const base: EffectPluginBlock = { ...BASE, diagnosticSeverity: { [grant.diagnostic]: 'error' } }
  return {
    library: renderEffectPlugin('library', base, [asOptIn(grant)]),
    test: renderEffectPlugin('test', base, [asOptIn(grant)]),
  }
}

const severityAt = (block: EffectPluginBlock, diagnostic: string): string | undefined => {
  const severity = block.diagnosticSeverity ?? {}
  return Object.hasOwn(severity, diagnostic) ? severity[diagnostic] : undefined
}

const grantInLists = (block: EffectPluginBlock) => (grant: Grant): boolean =>
  Match.value(grant).pipe(
    Match.tag('UnstableApi', (api) => api.role === 'test' || includes(block.allowedUnstableApis, api.api)),
    Match.tag('ExperimentalApi', (api) => api.role === 'test' || includes(block.allowedExperimentalApis, api.api)),
    Match.tag('DuplicatePackage', (duplicated) => includes(block.allowedDuplicatedPackages, duplicated.package)),
    Match.orElse(() => true),
  )

const listFor = (block: EffectPluginBlock) => (grant: Grant): ReadonlyArray<string> | undefined =>
  Match.value(grant).pipe(
    Match.tag('UnstableApi', () => block.allowedUnstableApis),
    Match.tag('ExperimentalApi', () => block.allowedExperimentalApis),
    Match.tag('DuplicatePackage', () => block.allowedDuplicatedPackages),
    Match.orElse(() => undefined),
  )

const sameLists = (left: EffectPluginBlock, right: EffectPluginBlock): boolean =>
  sameStrings(left.allowedUnstableApis, right.allowedUnstableApis) &&
  sameStrings(left.allowedExperimentalApis, right.allowedExperimentalApis) &&
  sameStrings(left.allowedDuplicatedPackages, right.allowedDuplicatedPackages)

it.prop(
  '∀grant_OxlintOverrides_≡Errors',
  { of: [OxlintRule], subject: overrideOf },
  (subject, [grant]) => {
    const override = subject(grant)[0]
    return override !== undefined &&
      override.rules[grant.rule]?.[0] === 'error' &&
      sameStrings(override.files, grant.files) &&
      sameValues(override.rules[grant.rule]?.slice(1), grant.options)
  },
)

it.prop(
  '∀grants_OxlintExclusions_≡Union',
  { of: [Schema.Array(OxlintExclusion), Schema.String], subject: excludesFor },
  (subject, [grants, rule]) =>
    sameStrings(
      subject(grants, rule),
      Arr.dedupe(Arr.flatMap(grants, (grant) => (grant.rule === rule ? [...grant.files] : []))),
    ),
)

it.prop(
  '∀grant_EffectPlugin_≡SortedUnion',
  { of: [Grant], subject: renderLibraryOf },
  (subject, [grant]) => {
    const block = subject(grant)
    const list = listFor(block)(grant)
    return (list === undefined || isSortedUnique(list)) && grantInLists(block)(grant)
  },
)

it.prop(
  '∀pair_EffectPlugin_≡OrderInsensitive',
  { of: [Grant, Grant], subject: renderPair },
  (subject, [first, second]) => {
    const forward = subject(first, second)
    return sameLists(forward, subject(second, first)) && grantInLists(forward)(first) && grantInLists(forward)(second)
  },
)

it.prop(
  '∀grant_DiagnosticExclusion_⊥Kept',
  { of: [DiagnosticExclusion], subject: renderBothRoles },
  (subject, [exclusion]) => {
    const both = subject(exclusion)
    const own = exclusion.role === 'library' ? both.library : both.test
    const other = exclusion.role === 'library' ? both.test : both.library
    return severityAt(own, exclusion.diagnostic) === undefined &&
      severityAt(other, exclusion.diagnostic) === 'error'
  },
)
