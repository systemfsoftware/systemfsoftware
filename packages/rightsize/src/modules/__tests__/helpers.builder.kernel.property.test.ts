/**
 * Helper-builder laws over randomized port maps (R13 / KTD11 — helpers are
 * pure functions of the started container's port map plus the spec env). A
 * URL/address/port-value declaration resolves its guest port through the
 * map and assembles the value from the declaration's own fields; a missing
 * binding can never produce a value.
 */
import { describe, it } from '@effect/vitest'
import { Option } from 'effect'
import { FastCheck as fc } from 'effect/testing'
import type { EnvPair } from '../../model/container-spec.schema.js'
import type { PortBinding } from '../../model/ports.schema.js'
import { buildHelperValue, containerHost } from '../helpers.js'
import { allPresets } from '../index.js'
import type { ModulePreset, PresetHelper } from '../preset.schema.js'

const HOST = containerHost

type UrlHelper = Extract<PresetHelper, { _tag: 'Url' }>
type AddressHelper = Extract<PresetHelper, { _tag: 'Address' }>
type PortValueHelper = Extract<PresetHelper, { _tag: 'PortValue' }>

/** Host ports are drawn from a range that leaves room for +1 sibling bindings. */
const hostPortDraw = fc.integer({ min: 2_000, max: 65_534 })

const envPair = (key: string, value: string): EnvPair => [key, value]

const lastEnvValue = (env: ReadonlyArray<EnvPair>, key: string): string => {
  let found = ''
  for (const [k, value] of env) {
    if (k === key) found = value
  }
  return found
}

/**
 * Reference assembly, written out literally from the declaration's fields:
 * the scheme/port/path/query/credential components joined by hand, against
 * which the interpreter's own assembly is measured.
 */
const referenceOf = (
  helper: PresetHelper,
  hostPortNumber: number | undefined,
  env: ReadonlyArray<EnvPair>,
): string | number | undefined => {
  switch (helper._tag) {
    case 'Url': {
      if (hostPortNumber === undefined) return undefined
      const username = helper.usernameEnv === undefined ? '' : lastEnvValue(env, helper.usernameEnv)
      const password = helper.passwordEnv === undefined ? '' : lastEnvValue(env, helper.passwordEnv)
      const auth = helper.usernameEnv === undefined ? '' : `${username}:${password}@`
      const suffix = `${helper.path ?? ''}${
        helper.databaseEnv === undefined ? '' : `/${lastEnvValue(env, helper.databaseEnv)}`
      }${helper.query === undefined ? '' : `?${helper.query}`}`
      return `${helper.scheme}://${auth}${HOST}:${hostPortNumber}${suffix}`
    }
    case 'Address':
      return hostPortNumber === undefined ? undefined : `${HOST}:${hostPortNumber}`
    case 'PortValue':
      return hostPortNumber
    case 'Constant':
      return helper.value
    default:
      throw new Error(`unreachable helper kind: ${String(helper)}`)
  }
}

const firstUrlHelper = (preset: ModulePreset): UrlHelper | undefined => {
  for (const helper of Object.values(preset.helpers)) {
    if (helper._tag === 'Url') return helper
  }
  return undefined
}

const firstAddressHelper = (preset: ModulePreset): AddressHelper | undefined => {
  for (const helper of Object.values(preset.helpers)) {
    if (helper._tag === 'Address') return helper
  }
  return undefined
}

const firstPortValueHelper = (preset: ModulePreset): PortValueHelper | undefined => {
  for (const helper of Object.values(preset.helpers)) {
    if (helper._tag === 'PortValue') return helper
  }
  return undefined
}

const firstCredentialUrlHelper = (preset: ModulePreset): UrlHelper | undefined => {
  const helper = firstUrlHelper(preset)
  return helper !== undefined && helper.usernameEnv !== undefined ? helper : undefined
}

const presetsWithUrlHelper = allPresets().filter((preset) => firstUrlHelper(preset) !== undefined)
const presetsWithAddressHelper = allPresets().filter((preset) => firstAddressHelper(preset) !== undefined)
const presetsWithPortValueHelper = allPresets().filter((preset) => firstPortValueHelper(preset) !== undefined)
const presetsWithCredentials = allPresets().filter((preset) => firstCredentialUrlHelper(preset) !== undefined)

describe('helper builders — property over port maps', () => {
  it.prop(
    '∀p_UrlHelper_≡Reference',
    [fc.constantFrom(...presetsWithUrlHelper), hostPortDraw],
    ([preset, drawn]) => {
      const helper = firstUrlHelper(preset)
      if (helper === undefined) return false
      const bindings: PortBinding[] = []
      for (const guestPort of preset.ports) {
        bindings.push({ guestPort, hostPort: guestPort === helper.guestPort ? drawn : drawn + 1 })
      }
      const expected = referenceOf(helper, drawn, preset.env)
      const actual = buildHelperValue(helper, bindings, preset.env)
      return expected !== undefined && Option.isSome(actual) && actual.value === expected
    },
  )

  it.prop(
    '∀p_Address_≡HostMapped',
    [fc.constantFrom(...presetsWithAddressHelper), hostPortDraw],
    ([preset, drawn]) => {
      const helper = firstAddressHelper(preset)
      if (helper === undefined) return false
      const expected = referenceOf(helper, drawn, preset.env)
      const actual = buildHelperValue(helper, [{ guestPort: helper.guestPort, hostPort: drawn }], preset.env)
      return expected === `${HOST}:${drawn}` && Option.isSome(actual) && actual.value === expected
    },
  )

  it.prop(
    '∀p_PortValue_≡HostMapped',
    [fc.constantFrom(...presetsWithPortValueHelper), hostPortDraw],
    ([preset, drawn]) => {
      const helper = firstPortValueHelper(preset)
      if (helper === undefined) return false
      const actual = buildHelperValue(helper, [{ guestPort: helper.guestPort, hostPort: drawn }], preset.env)
      return Option.isSome(actual) && actual.value === drawn
    },
  )

  it.prop(
    '∀p_CredentialUri_≡EnvDrawn',
    [
      fc.constantFrom(...presetsWithCredentials),
      fc.stringMatching(/^[a-z0-9]{1,8}$/),
      fc.stringMatching(/^[a-z0-9]{1,12}$/),
      fc.stringMatching(/^[a-z0-9]{1,8}$/),
    ],
    ([preset, user, password, database]) => {
      const helper = firstCredentialUrlHelper(preset)
      if (helper === undefined) return false
      const env: EnvPair[] = [...preset.env]
      if (helper.usernameEnv !== undefined) env.push(envPair(helper.usernameEnv, user))
      if (helper.passwordEnv !== undefined) env.push(envPair(helper.passwordEnv, password))
      if (helper.databaseEnv !== undefined) env.push(envPair(helper.databaseEnv, database))
      const expected = referenceOf(helper, 39000, env)
      const actual = buildHelperValue(helper, [{ guestPort: helper.guestPort, hostPort: 39000 }], env)
      return expected !== undefined && Option.isSome(actual) && actual.value === expected
    },
  )

  it.prop(
    '∀p_AbsentBinding_⊥Resolved',
    [fc.constantFrom(...presetsWithUrlHelper), hostPortDraw],
    ([preset, drawn]) => {
      const helper = firstUrlHelper(preset)
      if (helper === undefined) return false
      const partial: PortBinding[] = []
      for (const guestPort of preset.ports) {
        if (guestPort === helper.guestPort) continue
        partial.push({ guestPort, hostPort: drawn + 1 })
      }
      const actual = buildHelperValue(helper, partial, preset.env)
      return Option.isNone(actual)
    },
  )
})
