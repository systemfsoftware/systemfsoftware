import { Array as Arr, Match, Option, Order } from 'effect'
import { dual } from 'effect/Function'
import type { EffectPluginBlock, EffectPluginOverride } from './EffectPluginBlock.schema.js'
import type { Raw } from './json.js'
import type { OptIns, Role } from './OptIn.schema.js'
import { roleAppliesTo } from './role.js'

type KeyedOverride = readonly [key: string, override: EffectPluginOverride]

const sortedUnique = (values: ReadonlyArray<string>): ReadonlyArray<string> => Arr.dedupe([...values].sort())

const sortedUnion = (
  base: ReadonlyArray<string> | undefined,
  extra: ReadonlyArray<string>,
): ReadonlyArray<string> => sortedUnique([...(base ?? []), ...extra])

const listIf = (included: boolean, value: string): ReadonlyArray<string> => included ? [value] : []

const unstableEntries = (role: Role, optIns: OptIns): ReadonlyArray<string> =>
  Arr.flatMap(
    optIns,
    (optIn) =>
      Match.value(optIn.grant).pipe(
        Match.tag('UnstableApi', (grant) => listIf(roleAppliesTo(role)(grant.role), grant.api)),
        Match.orElse(() => []),
      ),
  )

const experimentalEntries = (role: Role, optIns: OptIns): ReadonlyArray<string> =>
  Arr.flatMap(
    optIns,
    (optIn) =>
      Match.value(optIn.grant).pipe(
        Match.tag('ExperimentalApi', (grant) => listIf(roleAppliesTo(role)(grant.role), grant.api)),
        Match.orElse(() => []),
      ),
  )

const duplicateEntries = (optIns: OptIns): ReadonlyArray<string> =>
  Arr.flatMap(
    optIns,
    (optIn) =>
      Match.value(optIn.grant).pipe(
        Match.tag('DuplicatePackage', (grant) => [grant.package]),
        Match.orElse(() => []),
      ),
  )

const overrideKey = (diagnostic: string, files: ReadonlyArray<string>): string =>
  `${diagnostic}\u0000${files.join('\u0000')}`

const keyedOverride = (role: Role) => (optIn: OptIns[number]): ReadonlyArray<KeyedOverride> =>
  Match.value(optIn.grant).pipe(
    Match.tag('DiagnosticExclusion', (grant): ReadonlyArray<KeyedOverride> =>
      grant.role === role
        ? [[
          overrideKey(grant.diagnostic, grant.files),
          { include: [...grant.files], options: { diagnosticSeverity: { [grant.diagnostic]: 'off' } } },
        ]]
        : []),
    Match.orElse((): ReadonlyArray<KeyedOverride> => []),
  )

const exclusionOverrides = (role: Role, optIns: OptIns): ReadonlyArray<EffectPluginOverride> => {
  const entries = Arr.flatMap(optIns, keyedOverride(role))
  const keys = Arr.sort(Arr.dedupe(Arr.map(entries, ([key]) => key)), Order.String)
  return Arr.flatMap(keys, (key) =>
    Option.match(Arr.findFirst(entries, ([candidate]) => candidate === key), {
      onNone: (): ReadonlyArray<EffectPluginOverride> => [],
      onSome: ([, override]): ReadonlyArray<EffectPluginOverride> => [override],
    }))
}

const withOverrides = (
  role: Role,
  base: EffectPluginBlock,
  optIns: OptIns,
): ReadonlyArray<EffectPluginOverride> => [...(base.overrides ?? []), ...exclusionOverrides(role, optIns)]

const severityOf = (base: EffectPluginBlock): Readonly<Record<string, 'error'>> => base.diagnosticSeverity ?? {}

const KNOWN_BLOCK_KEYS: Readonly<Record<string, true>> = {
  name: true,
  diagnosticSeverity: true,
  allowedUnstableApis: true,
  allowedExperimentalApis: true,
  allowedDuplicatedPackages: true,
  overrides: true,
}

const restRecord = (base: EffectPluginBlock): Readonly<Record<string, Raw>> =>
  Object.fromEntries(
    Object.entries(base)
      .filter(([key]) => KNOWN_BLOCK_KEYS[key] !== true)
      .sort(([left], [right]) => left < right ? -1 : 1),
  )

const listProp = (key: string, values: ReadonlyArray<string>): Readonly<Record<string, ReadonlyArray<string>>> =>
  values.length === 0 ? {} : { [key]: values }

const optionalOverrides = (
  overrides: ReadonlyArray<EffectPluginOverride>,
): Readonly<Record<string, ReadonlyArray<EffectPluginOverride>>> => overrides.length === 0 ? {} : { overrides }

export const renderEffectPlugin = dual<
  (role: Role, base: EffectPluginBlock) => (optIns: OptIns) => EffectPluginBlock,
  (role: Role, base: EffectPluginBlock, optIns: OptIns) => EffectPluginBlock
>(
  3,
  (role, base, optIns) => ({
    name: base.name,
    diagnosticSeverity: severityOf(base),
    ...listProp('allowedUnstableApis', sortedUnion(base.allowedUnstableApis, unstableEntries(role, optIns))),
    ...listProp(
      'allowedExperimentalApis',
      sortedUnion(base.allowedExperimentalApis, experimentalEntries(role, optIns)),
    ),
    ...listProp('allowedDuplicatedPackages', sortedUnion(base.allowedDuplicatedPackages, duplicateEntries(optIns))),
    ...optionalOverrides(withOverrides(role, base, optIns)),
    ...restRecord(base),
  }),
)
