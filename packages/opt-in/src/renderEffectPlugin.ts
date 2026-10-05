import { Array as Arr, Match } from 'effect'
import { dual } from 'effect/Function'
import type { EffectPluginBlock } from './EffectPluginBlock.schema.js'
import type { Raw } from './json.js'
import type { OptIns, Role } from './OptIn.schema.js'
import { roleAppliesTo } from './role.js'

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

const excludedDiagnostics = (role: Role, optIns: OptIns): ReadonlySet<string> =>
  new Set(
    Arr.flatMap(
      optIns,
      (optIn) =>
        Match.value(optIn.grant).pipe(
          Match.tag('DiagnosticExclusion', (grant) => listIf(grant.role === role, grant.diagnostic)),
          Match.orElse(() => []),
        ),
    ),
  )

const severityOf = (
  role: Role,
  base: EffectPluginBlock,
  optIns: OptIns,
): Readonly<Record<string, 'error'>> => {
  const excluded = excludedDiagnostics(role, optIns)
  return Object.fromEntries(Object.entries(base.diagnosticSeverity ?? {}).filter(([key]) => !excluded.has(key)))
}

const KNOWN_BLOCK_KEYS: Readonly<Record<string, true>> = {
  name: true,
  diagnosticSeverity: true,
  allowedUnstableApis: true,
  allowedExperimentalApis: true,
  allowedDuplicatedPackages: true,
}

const restRecord = (base: EffectPluginBlock): Readonly<Record<string, Raw>> =>
  Object.fromEntries(
    Object.entries(base)
      .filter(([key]) => KNOWN_BLOCK_KEYS[key] !== true)
      .sort(([left], [right]) => left < right ? -1 : 1),
  )

const listProp = (key: string, values: ReadonlyArray<string>): Readonly<Record<string, ReadonlyArray<string>>> =>
  values.length === 0 ? {} : { [key]: values }

export const renderEffectPlugin = dual<
  (role: Role, base: EffectPluginBlock) => (optIns: OptIns) => EffectPluginBlock,
  (role: Role, base: EffectPluginBlock, optIns: OptIns) => EffectPluginBlock
>(
  3,
  (role, base, optIns) => ({
    name: base.name,
    diagnosticSeverity: severityOf(role, base, optIns),
    ...listProp('allowedUnstableApis', sortedUnion(base.allowedUnstableApis, unstableEntries(role, optIns))),
    ...listProp(
      'allowedExperimentalApis',
      sortedUnion(base.allowedExperimentalApis, experimentalEntries(role, optIns)),
    ),
    ...listProp('allowedDuplicatedPackages', sortedUnion(base.allowedDuplicatedPackages, duplicateEntries(optIns))),
    ...restRecord(base),
  }),
)
