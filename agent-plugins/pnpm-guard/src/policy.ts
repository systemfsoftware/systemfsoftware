// Pure policy core for the pnpm-guard hooks: parse the two config files pnpm
// reads (pnpm-workspace.yaml, .npmrc) into one normalized key/value view,
// compute each side's effective pnpm 11 posture, and diff the guarded rows.
// No I/O, no clock, no randomness: a decision over two documents in, a verdict
// out. The shells (the file guard, the command guard) own reading and printing.

import { parse as parseYaml } from '@std/yaml'
import { isRecord } from './payload.ts'

/** Which config file a setting came from; pnpm reads both. */
export type Source = 'workspace' | 'npmrc'

/** The raw documents the policy decides over. */
export interface GuardSources {
  readonly workspaceYaml: string
  readonly npmrc: string
}

/** A parsed setting value, in the shape its setting family carries. */
export type ConfigValue =
  | { readonly kind: 'scalar'; readonly text: string }
  | { readonly kind: 'list'; readonly items: readonly string[] }
  | { readonly kind: 'map'; readonly entries: ReadonlyMap<string, string> }

/** One setting of one file, normalized: spelling, family, and subject. */
export interface ConfigSetting {
  readonly source: Source
  readonly key: string
  readonly setting: string
  readonly subject: string | undefined
  readonly value: ConfigValue
}

/** The normalized key/value view both formats collapse into. */
export interface ConfigView {
  readonly settings: ReadonlyMap<string, ConfigSetting>
}

/** A parse failure is the cannot-verify verdict: a skip would enforce nothing. */
export type GuardConfigParse =
  | { readonly tag: 'ok'; readonly view: ConfigView }
  | { readonly tag: 'cannot-verify'; readonly reason: string }

/** A value together with whether the file stated it (defaults are not stated). */
export interface Effective<Value> {
  readonly explicit: boolean
  readonly value: Value
}

/** pnpm's trust policy poles, ordered weakest to strongest. */
export type TrustPolicy = 'off' | 'no-downgrade'

/** Every guarded setting of a document, at its effective value. */
export interface EffectivePosture {
  readonly minimumReleaseAge: Effective<number>
  readonly minimumReleaseAgeStrict: Effective<boolean>
  readonly minimumReleaseAgeExclude: Effective<readonly string[]>
  readonly minimumReleaseAgeIgnoreMissingTime: Effective<boolean>
  readonly blockExoticSubdeps: Effective<boolean>
  readonly strictDepBuilds: Effective<boolean>
  readonly verifyStoreIntegrity: Effective<boolean>
  readonly trustPolicy: Effective<TrustPolicy>
  readonly trustPolicyExclude: Effective<readonly string[]>
  readonly trustPolicyIgnoreAfter: Effective<string | undefined>
  readonly trustLockfile: Effective<boolean>
  readonly allowBuilds: Effective<ReadonlyMap<string, boolean>>
  readonly dangerouslyAllowAllBuilds: Effective<boolean>
  readonly packageExtensions: Effective<ReadonlyMap<string, string>>
  readonly patchedDependencies: Effective<ReadonlyMap<string, string>>
  readonly workspaceRegistry: Effective<string>
  readonly workspaceScopeRegistries: Effective<ReadonlyMap<string, string>>
  readonly workspaceStrictSsl: Effective<boolean>
  readonly npmrcRegistry: Effective<string>
  readonly npmrcScopeRegistries: Effective<ReadonlyMap<string, string>>
  readonly npmrcStrictSsl: Effective<boolean>
  readonly npmrcAuth: Effective<ReadonlyMap<string, string>>
  readonly npmrcAlwaysAuth: Effective<boolean>
}

/** One weakened setting: what it was, what it becomes, and how to undo it. */
export interface Violation {
  readonly setting: string
  readonly before: string
  readonly after: string
  readonly remediation: string
}

export type PolicyVerdict =
  | { readonly tag: 'allow' }
  | { readonly tag: 'block'; readonly violations: readonly Violation[] }
  | { readonly tag: 'cannot-verify'; readonly reason: string }

/** A single change the command guard synthesizes from a pnpm invocation. */
export type GuardChange =
  | { readonly kind: 'set'; readonly source: Source; readonly key: string; readonly value: string }
  | { readonly kind: 'delete'; readonly source: Source; readonly key: string }
  | { readonly kind: 'addExclusion'; readonly source: Source; readonly key: string; readonly entry: string }
  | { readonly kind: 'grantBuild'; readonly packageName: string }

const SOURCE_LABEL: Readonly<Record<Source, string>> = {
  workspace: 'pnpm-workspace.yaml',
  npmrc: '.npmrc',
}

const DEFAULT_MINIMUM_RELEASE_AGE = 1440
const DEFAULT_REGISTRY = 'npmjs'
const TRUST_POLICY_RANK: Readonly<Record<TrustPolicy, number>> = { 'off': 0, 'no-downgrade': 1 }
const TRUST_POLICY_TEXTS: Readonly<Record<string, TrustPolicy>> = {
  'off': 'off',
  'false': 'off',
  'no-downgrade': 'no-downgrade',
}
const BOOLEAN_TEXTS: Readonly<Record<string, boolean>> = {
  'true': true,
  'yes': true,
  'on': true,
  'false': false,
  'no': false,
  'off': false,
}
const SCOPE_REGISTRY_KEY = /^(@?[^:\s]+):registry$/i
const NPMJS_REGISTRY = /^(?:npmjs|(?:https?:\/\/)?registry\.npmjs\.org\/?)$/i
const AUTH_SETTING_SUFFIXES = ['authtoken', 'auth'] as const
const ALWAYS_AUTH_SETTING = 'alwaysauth'
const REGISTRIES_SETTING = 'registries'

// ---------------------------------------------------------------------------
// Parse: documents in, one normalized view out.
// ---------------------------------------------------------------------------

const isArray = (value: unknown): value is readonly unknown[] => Array.isArray(value)

const displayOf = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : JSON.stringify(value) ?? 'null'

// camelCase, kebab-case, UPPER_SNAKE, and the environment spelling pnpm accepts
// (PNPM_CONFIG_MINIMUM_RELEASE_AGE) all collapse to one identifier, so a
// decision cannot depend on which spelling an actor chose.
const normalize = (key: string): string => {
  const canonical = key.toLowerCase().replace(/[^a-z0-9]/g, '')
  return canonical.startsWith('pnpmconfig')
    ? canonical.slice('pnpmconfig'.length)
    : canonical.startsWith('npmconfig')
    ? canonical.slice('npmconfig'.length)
    : canonical
}

const setting = (
  source: Source,
  key: string,
  settingId: string,
  subject: string | undefined,
  value: ConfigValue,
): ConfigSetting => ({ source, key, setting: settingId, subject, value })

const keyOf = (entry: ConfigSetting): string =>
  `${entry.source}:${entry.setting}${entry.subject === undefined ? '' : `:${entry.subject}`}`

// `registries` carries the default registry and the per-scope registries in one
// map; split them into the two settings the matrix guards.
const registrySettings = (
  source: Source,
  key: string,
  value: Readonly<Record<string, unknown>>,
): readonly ConfigSetting[] =>
  Object.entries(value).flatMap(([scope, registry]) =>
    scope === 'default'
      ? [setting(source, key, 'registry', undefined, { kind: 'scalar', text: displayOf(registry) })]
      : [setting(source, `${scope}:registry`, 'scoperegistry', scope, { kind: 'scalar', text: displayOf(registry) })]
  )

const scalarSetting = (source: Source, key: string, settingId: string, value: unknown): ConfigSetting =>
  isArray(value)
    ? setting(source, key, settingId, undefined, { kind: 'list', items: value.map(displayOf) })
    : isRecord(value)
    ? setting(source, key, settingId, undefined, {
      kind: 'map',
      entries: new Map(Object.entries(value).map(([entryKey, entry]) => [entryKey, displayOf(entry)])),
    })
    : setting(source, key, settingId, undefined, { kind: 'scalar', text: displayOf(value) })

const settingsFor = (source: Source, key: string, value: unknown): readonly ConfigSetting[] => {
  const scopeRegistry = SCOPE_REGISTRY_KEY.exec(key)
  return scopeRegistry !== null
    ? [
      setting(source, key, 'scoperegistry', scopeRegistry[1] ?? key, {
        kind: 'scalar',
        text: displayOf(value),
      }),
    ]
    : normalize(key) === REGISTRIES_SETTING && isRecord(value)
    ? registrySettings(source, key, value)
    : [scalarSetting(source, key, normalize(key), value)]
}

const viewWith = (view: ConfigView, settings: readonly ConfigSetting[]): ConfigView => ({
  settings: new Map([...view.settings, ...settings.map((entry) => [keyOf(entry), entry] as const)]),
})

const emptyView: ConfigView = { settings: new Map() }

const viewOf = (source: Source, entries: readonly (readonly [string, unknown])[]): ConfigView =>
  viewWith(
    emptyView,
    entries.flatMap(([key, value]) => value === null || value === undefined ? [] : settingsFor(source, key, value)),
  )

const workspaceView = (yaml: string): GuardConfigParse => {
  let parsed: unknown
  try {
    parsed = parseYaml(yaml)
  } catch {
    return { tag: 'cannot-verify', reason: 'the pnpm-workspace content is not valid YAML' }
  }
  return parsed === null || parsed === undefined
    ? { tag: 'ok', view: emptyView }
    : isRecord(parsed)
    ? { tag: 'ok', view: viewOf('workspace', Object.entries(parsed)) }
    : { tag: 'cannot-verify', reason: 'the pnpm-workspace content is not a YAML mapping' }
}

// npmrc is INI: `key=value`, `key = value`, a bare `key` meaning true, and
// `#`/`;` comments. A key keeps its `:` and `/` (scope and host forms).
const npmrcEntries = (ini: string): readonly (readonly [string, string])[] =>
  ini.split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#') && !line.startsWith(';'))
    .map((line) => {
      const separator = line.indexOf('=')
      return separator === -1
        ? ([line, 'true'] as const)
        : ([line.slice(0, separator).trim(), line.slice(separator + 1).trim()] as const)
    })

export const parseGuardConfig = (sources: GuardSources): GuardConfigParse =>
  matchParse(workspaceView(sources.workspaceYaml), (workspace) => ({
    tag: 'ok',
    view: viewWith(workspace, [...viewOf('npmrc', npmrcEntries(sources.npmrc)).settings.values()]),
  }))

const matchParse = <Result>(
  parsed: GuardConfigParse,
  whenParsed: (view: ConfigView) => Result,
): Result | { readonly tag: 'cannot-verify'; readonly reason: string } =>
  parsed.tag === 'ok' ? whenParsed(parsed.view) : parsed

// ---------------------------------------------------------------------------
// Effective posture: explicit setting, else the pnpm 11 default.
// ---------------------------------------------------------------------------

const entryOf = (view: ConfigView, source: Source, settingId: string, subject?: string): ConfigSetting | undefined =>
  view.settings.get(`${source}:${settingId}${subject === undefined ? '' : `:${subject}`}`)

const booleanText = (text: string): boolean | undefined => BOOLEAN_TEXTS[text.toLowerCase()]

const scalarOf = (view: ConfigView, source: Source, settingId: string): string | undefined => {
  const entry = entryOf(view, source, settingId)
  return entry?.value.kind === 'scalar' ? entry.value.text : undefined
}

const boolOf = (view: ConfigView, source: Source, settingId: string, fallback: boolean): Effective<boolean> => {
  const text = scalarOf(view, source, settingId)
  const parsed = text === undefined ? undefined : booleanText(text)
  return parsed === undefined
    ? { explicit: false, value: fallback }
    : { explicit: true, value: parsed }
}

const numberOf = (view: ConfigView, source: Source, settingId: string, fallback: number): Effective<number> => {
  const text = scalarOf(view, source, settingId)
  const parsed = text === undefined ? undefined : Number(text)
  return parsed === undefined || !Number.isFinite(parsed)
    ? { explicit: false, value: fallback }
    : { explicit: true, value: parsed }
}

const listOf = (view: ConfigView, source: Source, settingId: string): Effective<readonly string[]> => {
  const entry = entryOf(view, source, settingId)
  return entry === undefined
    ? { explicit: false, value: [] }
    : entry.value.kind === 'list'
    ? { explicit: true, value: entry.value.items }
    : entry.value.kind === 'scalar'
    ? { explicit: true, value: entry.value.text === '' ? [] : [entry.value.text] }
    : { explicit: true, value: [...entry.value.entries.keys()] }
}

const mapOf = (view: ConfigView, source: Source, settingId: string): Effective<ReadonlyMap<string, string>> => {
  const entry = entryOf(view, source, settingId)
  return {
    explicit: entry !== undefined,
    value: entry?.value.kind === 'map' ? entry.value.entries : new Map<string, string>(),
  }
}

// An `allowBuilds` entry is a grant when it is `true`; the list form grants every
// package it names, so both shapes reach the same posture.
const allowBuildsOf = (view: ConfigView): Effective<ReadonlyMap<string, boolean>> => {
  const entry = entryOf(view, 'workspace', 'allowbuilds')
  const entries = entry?.value.kind === 'map'
    ? [...entry.value.entries].map(([packageName, text]) => [packageName, booleanText(text) ?? false] as const)
    : entry?.value.kind === 'list'
    ? entry.value.items.map((packageName) => [packageName, true] as const)
    : []
  return { explicit: entry !== undefined, value: new Map(entries) }
}

const scopeRegistriesOf = (view: ConfigView, source: Source): Effective<ReadonlyMap<string, string>> => {
  const entries = [...view.settings.values()].flatMap((entry) =>
    entry.source !== source ||
      entry.setting !== 'scoperegistry' ||
      entry.subject === undefined ||
      entry.value.kind !== 'scalar'
      ? []
      : [[entry.subject, entry.value.text] as const]
  )
  return { explicit: entries.length > 0, value: new Map(entries) }
}

const isAuthSetting = (settingId: string): boolean =>
  settingId !== ALWAYS_AUTH_SETTING && AUTH_SETTING_SUFFIXES.some((suffix) => settingId.endsWith(suffix))

const authOf = (view: ConfigView): Effective<ReadonlyMap<string, string>> => {
  const entries = [...view.settings.values()].flatMap((entry) =>
    entry.source === 'npmrc' && isAuthSetting(entry.setting) && entry.value.kind === 'scalar' && entry.value.text !== ''
      ? [[entry.key, entry.value.text] as const]
      : []
  )
  return { explicit: entries.length > 0, value: new Map(entries) }
}

const trustPolicyOf = (view: ConfigView): Effective<TrustPolicy> => {
  const text = scalarOf(view, 'workspace', 'trustpolicy')
  return text === undefined
    ? { explicit: false, value: 'off' }
    : { explicit: true, value: TRUST_POLICY_TEXTS[text.toLowerCase()] ?? 'off' }
}

// Strictness is on whenever the age is stated explicitly, and only then: the
// default is non-strict, but naming an age is itself a strictness choice.
const strictAgeOf = (view: ConfigView, age: Effective<number>): Effective<boolean> => {
  const declared = boolOf(view, 'workspace', 'minimumreleaseagestrict', age.explicit)
  return { explicit: declared.explicit || age.explicit, value: declared.explicit ? declared.value : age.explicit }
}

const registryOf = (view: ConfigView, source: Source): Effective<string> => ({
  explicit: entryOf(view, source, 'registry') !== undefined,
  value: scalarOf(view, source, 'registry') ?? DEFAULT_REGISTRY,
})

export const readEffectiveSettings = (view: ConfigView): EffectivePosture => {
  const age = numberOf(view, 'workspace', 'minimumreleaseage', DEFAULT_MINIMUM_RELEASE_AGE)
  const trustPolicyIgnoreAfter = scalarOf(view, 'workspace', 'trustpolicyignoreafter')
  return {
    minimumReleaseAge: age,
    minimumReleaseAgeStrict: strictAgeOf(view, age),
    minimumReleaseAgeExclude: listOf(view, 'workspace', 'minimumreleaseageexclude'),
    minimumReleaseAgeIgnoreMissingTime: boolOf(view, 'workspace', 'minimumreleaseageignoremissingtime', true),
    blockExoticSubdeps: boolOf(view, 'workspace', 'blockexoticsubdeps', true),
    strictDepBuilds: boolOf(view, 'workspace', 'strictdepbuilds', true),
    verifyStoreIntegrity: boolOf(view, 'workspace', 'verifystoreintegrity', true),
    trustPolicy: trustPolicyOf(view),
    trustPolicyExclude: listOf(view, 'workspace', 'trustpolicyexclude'),
    trustPolicyIgnoreAfter: { explicit: trustPolicyIgnoreAfter !== undefined, value: trustPolicyIgnoreAfter },
    trustLockfile: boolOf(view, 'workspace', 'trustlockfile', false),
    allowBuilds: allowBuildsOf(view),
    dangerouslyAllowAllBuilds: boolOf(view, 'workspace', 'dangerouslyallowallbuilds', false),
    packageExtensions: mapOf(view, 'workspace', 'packageextensions'),
    patchedDependencies: mapOf(view, 'workspace', 'patcheddependencies'),
    workspaceRegistry: registryOf(view, 'workspace'),
    workspaceScopeRegistries: scopeRegistriesOf(view, 'workspace'),
    workspaceStrictSsl: boolOf(view, 'workspace', 'strictssl', true),
    npmrcRegistry: registryOf(view, 'npmrc'),
    npmrcScopeRegistries: scopeRegistriesOf(view, 'npmrc'),
    npmrcStrictSsl: boolOf(view, 'npmrc', 'strictssl', true),
    npmrcAuth: authOf(view),
    npmrcAlwaysAuth: boolOf(view, 'npmrc', 'alwaysauth', false),
  }
}

// ---------------------------------------------------------------------------
// The matrix: one row per guarded setting, folded into the verdict.
// ---------------------------------------------------------------------------

interface GuardRow {
  readonly violations: (before: EffectivePosture, after: EffectivePosture) => readonly Violation[]
}

const label = (source: Source, subject: string): string => `${SOURCE_LABEL[source]} ${subject}`

const violationOf = (settingLabel: string, before: string, after: string, remediation: string): Violation => ({
  setting: settingLabel,
  before,
  after,
  remediation,
})

const heldTrueRow = (
  settingLabel: string,
  pick: (posture: EffectivePosture) => Effective<boolean>,
  remediation: string,
): GuardRow => ({
  violations: (before, after) => {
    const from = pick(before)
    const to = pick(after)
    return from.value && !to.value ? [violationOf(settingLabel, String(from.value), String(to.value), remediation)] : []
  },
})

const gainedTrueRow = (
  settingLabel: string,
  pick: (posture: EffectivePosture) => Effective<boolean>,
  remediation: string,
): GuardRow => ({
  violations: (before, after) => {
    const from = pick(before)
    const to = pick(after)
    return !from.value && to.value ? [violationOf(settingLabel, String(from.value), String(to.value), remediation)] : []
  },
})

const addedItemsRow = (
  settingLabel: string,
  pick: (posture: EffectivePosture) => Effective<readonly string[]>,
  remediation: string,
): GuardRow => ({
  violations: (before, after) => {
    const from = pick(before)
    const to = pick(after)
    return to.value
      .filter((item) => !from.value.includes(item))
      .map(() => violationOf(settingLabel, JSON.stringify(from.value), JSON.stringify(to.value), remediation))
  },
})

const introducedOrChangedRow = (
  settingLabel: string,
  entryLabel: (subject: string) => string,
  pick: (posture: EffectivePosture) => Effective<ReadonlyMap<string, string>>,
  remediation: string,
): GuardRow => ({
  violations: (before, after) => {
    const from = pick(before)
    const to = pick(after)
    return !from.explicit && to.explicit
      ? [violationOf(settingLabel, 'absent', 'present', remediation)]
      : [...to.value].flatMap(([subject, value]) =>
        from.value.get(subject) === value
          ? []
          : [
            violationOf(
              entryLabel(subject),
              from.value.get(subject) ?? 'absent',
              value,
              remediation,
            ),
          ]
      )
  },
})

const registryRow = (
  settingLabel: string,
  pick: (posture: EffectivePosture) => Effective<string>,
  remediation: string,
): GuardRow => ({
  violations: (before, after) => {
    const from = pick(before)
    const to = pick(after)
    return isNpmjs(from.value) && !isNpmjs(to.value)
      ? [violationOf(settingLabel, from.value, to.value, remediation)]
      : []
  },
})

const scopeRegistryRow = (
  settingLabel: (scope: string) => string,
  pick: (posture: EffectivePosture) => Effective<ReadonlyMap<string, string>>,
  remediation: string,
): GuardRow => ({
  violations: (before, after) => {
    const from = pick(before)
    const to = pick(after)
    return [...to.value].flatMap(([scope, registry]) =>
      from.value.get(scope) === undefined || from.value.get(scope) === registry
        ? []
        : [violationOf(settingLabel(scope), from.value.get(scope) ?? '', registry, remediation)]
    )
  },
})

const isNpmjs = (registry: string): boolean => NPMJS_REGISTRY.test(registry.trim())

const grantRow = (remediation: string): GuardRow => ({
  violations: (before, after) =>
    [...after.allowBuilds.value].flatMap(([packageName, granted]) =>
      granted && before.allowBuilds.value.get(packageName) !== true
        ? [
          violationOf(
            label('workspace', `allowBuilds["${packageName}"]`),
            before.allowBuilds.value.get(packageName) === undefined
              ? 'absent'
              : String(before.allowBuilds.value.get(packageName)),
            'true',
            remediation,
          ),
        ]
        : []
    ),
})

const ageRow: GuardRow = {
  violations: (before, after) => {
    const from = before.minimumReleaseAge
    const to = after.minimumReleaseAge
    return to.value < from.value || (from.explicit && !to.explicit)
      ? [
        violationOf(
          label('workspace', 'minimumReleaseAge'),
          String(from.value),
          String(to.value),
          'Restore minimumReleaseAge to its previous value or higher; a shorter quarantine admits fresh releases.',
        ),
      ]
      : []
  },
}

const trustPolicyRow: GuardRow = {
  violations: (before, after) => {
    const from = before.trustPolicy
    const to = after.trustPolicy
    return TRUST_POLICY_RANK[to.value] < TRUST_POLICY_RANK[from.value]
      ? [
        violationOf(
          label('workspace', 'trustPolicy'),
          from.value,
          to.value,
          'Restore trustPolicy to no-downgrade (off admits a trust downgrade).',
        ),
      ]
      : []
  },
}

const trustPolicyIgnoreAfterRow: GuardRow = {
  violations: (before, after) => {
    const from = before.trustPolicyIgnoreAfter.value
    const to = after.trustPolicyIgnoreAfter.value
    return to !== undefined && to !== from
      ? [
        violationOf(
          label('workspace', 'trustPolicyIgnoreAfter'),
          from ?? 'unset',
          to,
          'Remove trustPolicyIgnoreAfter; it exempts versions from the trust policy.',
        ),
      ]
      : []
  },
}

const authRow: GuardRow = {
  violations: (before, after) =>
    [...after.npmrcAuth.value].flatMap(([key, value]) =>
      before.npmrcAuth.value.get(key) === value
        ? []
        : [
          violationOf(
            label('npmrc', key),
            before.npmrcAuth.value.has(key) ? 'present' : 'absent',
            'present',
            'Remove the credential line; a human provisions auth by hand.',
          ),
        ]
    ),
}

const ROWS: readonly GuardRow[] = [
  ageRow,
  heldTrueRow(
    label('workspace', 'minimumReleaseAgeStrict'),
    (posture) => posture.minimumReleaseAgeStrict,
    'Set minimumReleaseAgeStrict back to true, or remove the explicit minimumReleaseAge key.',
  ),
  addedItemsRow(
    label('workspace', 'minimumReleaseAgeExclude'),
    (posture) => posture.minimumReleaseAgeExclude,
    'Remove the added exclusion entry; the release-age quarantine applies to every package.',
  ),
  gainedTrueRow(
    label('workspace', 'minimumReleaseAgeIgnoreMissingTime'),
    (posture) => posture.minimumReleaseAgeIgnoreMissingTime,
    'Set minimumReleaseAgeIgnoreMissingTime back to false; a release with no publish time must not skip the quarantine.',
  ),
  heldTrueRow(
    label('workspace', 'blockExoticSubdeps'),
    (posture) => posture.blockExoticSubdeps,
    'Set blockExoticSubdeps back to true.',
  ),
  heldTrueRow(
    label('workspace', 'strictDepBuilds'),
    (posture) => posture.strictDepBuilds,
    'Set strictDepBuilds back to true.',
  ),
  heldTrueRow(
    label('workspace', 'verifyStoreIntegrity'),
    (posture) => posture.verifyStoreIntegrity,
    'Set verifyStoreIntegrity back to true.',
  ),
  trustPolicyRow,
  addedItemsRow(
    label('workspace', 'trustPolicyExclude'),
    (posture) => posture.trustPolicyExclude,
    'Remove the added trust-policy exclusion entry.',
  ),
  trustPolicyIgnoreAfterRow,
  gainedTrueRow(
    label('workspace', 'trustLockfile'),
    (posture) => posture.trustLockfile,
    'Set trustLockfile back to false so the lockfile verification pass runs.',
  ),
  grantRow('Revoke the build grant; a human grants build scripts deliberately.'),
  gainedTrueRow(
    label('workspace', 'dangerouslyAllowAllBuilds'),
    (posture) => posture.dangerouslyAllowAllBuilds,
    'Remove dangerouslyAllowAllBuilds.',
  ),
  introducedOrChangedRow(
    label('workspace', 'packageExtensions'),
    (subject) => label('workspace', `packageExtensions["${subject}"]`),
    (posture) => posture.packageExtensions,
    'Revert the packageExtensions entry; it rewrites resolution for every install.',
  ),
  introducedOrChangedRow(
    label('workspace', 'patchedDependencies'),
    (subject) => label('workspace', `patchedDependencies["${subject}"]`),
    (posture) => posture.patchedDependencies,
    'Revert the patchedDependencies entry; a patch is install-time code.',
  ),
  registryRow(
    label('workspace', 'registries["default"]'),
    (posture) => posture.workspaceRegistry,
    'Point the default registry back at npmjs.',
  ),
  scopeRegistryRow(
    (scope) => label('workspace', `registries["${scope}"]`),
    (posture) => posture.workspaceScopeRegistries,
    'Restore the scope registry URL.',
  ),
  heldTrueRow(
    label('workspace', 'strictSsl'),
    (posture) => posture.workspaceStrictSsl,
    'Restore strictSsl to true.',
  ),
  registryRow(
    label('npmrc', 'registry'),
    (posture) => posture.npmrcRegistry,
    'Point registry back at npmjs, or remove the line.',
  ),
  scopeRegistryRow(
    (scope) => label('npmrc', `${scope}:registry`),
    (posture) => posture.npmrcScopeRegistries,
    'Restore the scope-registry line.',
  ),
  heldTrueRow(
    label('npmrc', 'strict-ssl'),
    (posture) => posture.npmrcStrictSsl,
    'Restore strict-ssl to true.',
  ),
  authRow,
  gainedTrueRow(
    label('npmrc', 'always-auth'),
    (posture) => posture.npmrcAlwaysAuth,
    'Set always-auth back to false.',
  ),
]

const evaluatePostures = (before: EffectivePosture, after: EffectivePosture): PolicyVerdict => {
  const violations = ROWS.flatMap((row) => row.violations(before, after))
  return violations.length === 0 ? { tag: 'allow' } : { tag: 'block', violations }
}

// ---------------------------------------------------------------------------
// Evaluation entry points.
// ---------------------------------------------------------------------------

export const evaluateGuardPair = (before: GuardSources, after: GuardSources): PolicyVerdict =>
  matchParse(
    parseGuardConfig(before),
    (beforeView) =>
      matchParse(parseGuardConfig(after), (afterView) =>
        evaluatePostures(readEffectiveSettings(beforeView), readEffectiveSettings(afterView))),
  )

const withoutSetting = (view: ConfigView, source: Source, settingId: string): ConfigView => ({
  settings: new Map([...view.settings].filter(([key]) => key !== `${source}:${settingId}`)),
})

const withListEntry = (view: ConfigView, source: Source, key: string, entry: string): ConfigView => {
  const settingId = normalize(key)
  const existing = entryOf(view, source, settingId)
  const items = existing?.value.kind === 'list' ? existing.value.items : []
  return viewWith(view, [setting(source, key, settingId, undefined, { kind: 'list', items: [...items, entry] })])
}

const withGrant = (view: ConfigView, packageName: string): ConfigView => {
  const existing = entryOf(view, 'workspace', 'allowbuilds')
  const entries = existing?.value.kind === 'map' ? existing.value.entries : new Map<string, string>()
  return viewWith(view, [
    setting('workspace', 'allowBuilds', 'allowbuilds', undefined, {
      kind: 'map',
      entries: new Map([...entries, [packageName, 'true']]),
    }),
  ])
}

const applyChange = (view: ConfigView, change: GuardChange): ConfigView =>
  change.kind === 'set'
    ? viewWith(view, settingsFor(change.source, change.key, change.value))
    : change.kind === 'delete'
    ? withoutSetting(view, change.source, normalize(change.key))
    : change.kind === 'addExclusion'
    ? withListEntry(view, change.source, change.key, change.entry)
    : withGrant(view, change.packageName)

export const evaluateGuardChange = (current: GuardSources, change: GuardChange): PolicyVerdict =>
  matchParse(
    parseGuardConfig(current),
    (view) => evaluatePostures(readEffectiveSettings(view), readEffectiveSettings(applyChange(view, change))),
  )

// ---------------------------------------------------------------------------
// Messages.
// ---------------------------------------------------------------------------

const formatViolation = (violation: Violation): string =>
  `- ${violation.setting}: ${violation.before} -> ${violation.after}. ${violation.remediation}`

export const formatPolicyVerdict = (verdict: PolicyVerdict): string =>
  verdict.tag === 'allow'
    ? ''
    : verdict.tag === 'cannot-verify'
    ? `Blocked: cannot verify this pnpm config change (${verdict.reason}). ` +
      'Re-express the change as Edit, Write, or MultiEdit so the before/after content can be checked.'
    : [
      `Blocked: this change weakens pnpm's install-time supply-chain posture:`,
      ...verdict.violations.map(formatViolation),
    ]
      .join('\n')
