import { Array as Arr, Match, Option, Schema } from 'effect'
import { dual } from 'effect/Function'
import type { EffectPluginBlock } from './EffectPluginBlock.schema.js'
import { asRawObject, type Raw, type RawObject } from './json.js'
import type { OptIn, OptIns, Role } from './OptIn.schema.js'
import { renderEffectPlugin } from './renderEffectPlugin.js'
import { roleAppliesTo } from './role.js'

const EXTENDS_LIBRARY = '@systemfsoftware/tsconfig/effect'
const EXTENDS_ENTRYPOINT = '@systemfsoftware/tsconfig/effect/entrypoint'

const ROLE_BY_EXTENDS: Readonly<Record<string, Role>> = {
  [EXTENDS_LIBRARY]: 'library',
  [EXTENDS_ENTRYPOINT]: 'test',
}

const noSpecifiers = (): ReadonlyArray<string> => []

const singleSpecifierOf = (value: Raw): ReadonlyArray<string> =>
  Option.getOrElse(
    Option.map(Schema.decodeUnknownOption(Schema.String)(value), (specifier) => [specifier]),
    noSpecifiers,
  )

const specifiersOf = (value: Raw): ReadonlyArray<string> =>
  Option.getOrElse(Schema.decodeUnknownOption(Schema.Array(Schema.String))(value), () => singleSpecifierOf(value))

export const roleOf = (extendsValue: Raw): Role | undefined =>
  Option.getOrUndefined(
    Arr.findFirst(specifiersOf(extendsValue), (specifier) => Option.fromNullishOr(ROLE_BY_EXTENDS[specifier])),
  )

export const extendsOf = (tsconfig: RawObject): Raw => tsconfig['extends']

const isEffectChannel = (role: Role) => (optIn: OptIn): boolean =>
  Match.value(optIn.grant).pipe(
    Match.tag('DiagnosticExclusion', (grant) => grant.role === role),
    Match.tag('UnstableApi', (grant) => roleAppliesTo(role)(grant.role)),
    Match.tag('ExperimentalApi', (grant) => roleAppliesTo(role)(grant.role)),
    Match.tag('DuplicatePackage', () => true),
    Match.orElse(() => false),
  )

export const hasEffectChannelGrant = dual<
  (role: Role) => (optIns: OptIns) => boolean,
  (role: Role, optIns: OptIns) => boolean
>(
  2,
  (role, optIns) => Arr.some(optIns, isEffectChannel(role)),
)

const withPlugins = (tsconfig: RawObject, plugins: ReadonlyArray<Raw>): RawObject => {
  const compilerOptions = asRawObject(tsconfig['compilerOptions'])
  return { ...tsconfig, compilerOptions: { ...compilerOptions, plugins } }
}

const stripPlugins = (compilerOptions: RawObject | undefined): RawObject =>
  Object.fromEntries(Object.entries(compilerOptions ?? {}).filter(([key]) => key !== 'plugins'))

const withoutPlugins = (tsconfig: RawObject): RawObject => {
  const compilerOptions = asRawObject(tsconfig['compilerOptions'])
  return { ...tsconfig, compilerOptions: stripPlugins(compilerOptions) }
}

export interface SyncInput {
  readonly tsconfig: RawObject
  readonly role: Role
  readonly base: EffectPluginBlock
  readonly optIns: OptIns
}

export const planSync = ({ tsconfig, role, base, optIns }: SyncInput): RawObject =>
  hasEffectChannelGrant(role, optIns)
    ? withPlugins(tsconfig, [renderEffectPlugin(role, base, optIns)])
    : withoutPlugins(tsconfig)

export const serializeTsconfig = (tsconfig: RawObject): string => `${JSON.stringify(tsconfig, null, 2)}\n`
