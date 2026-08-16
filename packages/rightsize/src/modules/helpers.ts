/**
 * The one helper interpreter (R13, KTD11) — turns a preset's declared helper
 * into a concrete URI/address/port value against the started container's
 * port map and env. Pure by construction: given a binding map and env it
 * returns the same value every time, surfacing a missing binding as
 * `Option.none()` instead of throwing. `containerHost` is the model-constant
 * host of a published container (upstream's `host`, always `127.0.0.1`).
 */
import { Match, Option } from 'effect'
import type { EnvPair } from '../model/container-spec.js'
import type { PortBinding } from '../model/ports.js'
import type { PresetHelper } from './preset.js'

/** The host every published container is reachable on (`127.0.0.1` upstream). */
export const containerHost = '127.0.0.1' as const

/**
 * Resolves a guest port to its allocated host port through the binding map.
 * Returns `none` when the guest port was never allocated — the flag the
 * launch workflow's port pre-allocation (R7) can never leave behind.
 */
export const hostPortFor = (ports: ReadonlyArray<PortBinding>, guestPort: number): Option.Option<number> => {
  for (const binding of ports) {
    if (binding.guestPort === guestPort) return Option.some(binding.hostPort)
  }
  return Option.none()
}

/** Last-write-wins env lookup, mirroring the spec combinators' env semantics. */
const lastEnvValue = (env: ReadonlyArray<EnvPair>, key: string): string => {
  let found = ''
  for (const [k, value] of env) {
    if (k === key) found = value
  }
  return found
}

/**
 * Builds the helper's value for a started container. `env` defaults to the
 * preset's own env pairs — pass the (possibly overridden) spec env to have
 * credential helpers reflect builder overrides (`withUsername` & co.), whose
 * only observable effect is a new env pair.
 */
export const buildHelperValue = (
  helper: PresetHelper,
  ports: ReadonlyArray<PortBinding>,
  env: ReadonlyArray<EnvPair> = [],
  host: string = containerHost,
): Option.Option<string | number> =>
  Match.typeTags<PresetHelper>()({
    Url: (url) => {
      const mapped = hostPortFor(ports, url.guestPort)
      if (Option.isNone(mapped)) return Option.none()
      let authority = `${host}:${mapped.value}`
      if (url.usernameEnv !== undefined) {
        const username = lastEnvValue(env, url.usernameEnv)
        const password = url.passwordEnv === undefined ? '' : lastEnvValue(env, url.passwordEnv)
        authority = `${username}:${password}@${authority}`
      }
      const suffix = `${url.path ?? ''}${
        url.databaseEnv === undefined ? '' : `/${lastEnvValue(env, url.databaseEnv)}`
      }${url.query === undefined ? '' : `?${url.query}`}`
      return Option.some(`${url.scheme}://${authority}${suffix}`)
    },
    Address: (address) => {
      const mapped = hostPortFor(ports, address.guestPort)
      return Option.isNone(mapped) ? Option.none() : Option.some(`${host}:${mapped.value}`)
    },
    PortValue: (portValue) => hostPortFor(ports, portValue.guestPort),
    Constant: (constant) => Option.some(constant.value),
  })(helper)
