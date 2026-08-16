/**
 * The preset→spec interpreter (R13, KTD11 — one mechanism, many rows):
 * `buildContainerSpec` lifts a preset row's data into a `ContainerSpec`
 * through the pure spec combinators, `applySpecTransforms` applies the
 * row's post-port-allocation `customizeSpec` hooks (Kafka/Redpanda
 * advertised listeners, ArangoDB's no-auth drop) exactly like upstream's
 * `customizeSpec`, and `requirePresetImage` routes any image through the
 * image-compatibility gate — `IncompatibleImageError` before any I/O.
 *
 * All pure: no I/O here, so a spec can be assembled and gated at
 * spec-build time without touching a backend.
 */
import { Match, Option, Result } from 'effect'
import type { ContainerSpec } from '../model/container-spec.schema.js'
import { requireCompatibleImage } from '../model/docker-image-name.js'
import { IncompatibleImageError } from '../model/errors.js'
import type { PortBinding } from '../model/ports.schema.js'
import {
  newContainerSpec,
  waitingFor,
  withCommand,
  withEnvPairs,
  withExposedPorts,
  withMemoryLimit,
  withNetworkAliases,
  withStartupTimeout,
} from '../model/spec-combinators.js'
import { hostPortFor } from './helpers.js'
import type { ModulePreset, SpecTransform } from './preset.schema.js'

/** The float-in default image of a row; `none` means an explicit image is required (elasticsearch). */
export const defaultImageOf = (preset: ModulePreset): Option.Option<string> =>
  preset.image === undefined ? Option.none() : Option.some(preset.image)

/**
 * Runs the image-compatibility gate (R13): returns the exact image string to
 * hand to a backend when the repository matches the row's expectation, or
 * `IncompatibleImageError` before any backend call. An explicitly supplied
 * image is always used verbatim — the gate checks and returns, it never
 * rewrites (upstream `DockerImageName.requireCompatible` as data-accessor).
 */
export const requireImageForPreset = (
  preset: ModulePreset,
  image: string,
): Result.Result<string, IncompatibleImageError> => requireCompatibleImage(image, preset.expectedRepository)

/**
 * Substitutes every `${port:<guestPort>}` marker in a template with the
 * allocated host port from `bindings`. Markers whose guest port is not in
 * the map stay untouched — a template never grows a wrong number, and the
 * caller applies transforms only after allocation (R7) so this is a gap
 * that cannot normally be reached.
 */
export const substituteMappedPorts = (template: string, bindings: ReadonlyArray<PortBinding>): string =>
  template.replace(/\$\{port:(\d+)\}/g, (_marker, guestPort: string) => {
    const parsed = Number(guestPort)
    if (Number.isNaN(parsed)) return _marker
    const mapped = hostPortFor(bindings, parsed)
    return Option.isSome(mapped) ? String(mapped.value) : _marker
  })

/**
 * Builds the base `ContainerSpec` for a row: env, unallocated port bindings
 * (`hostPort: 0`, the launch workflow's pre-allocator replaces them), the
 * command, aliases, memory floor, startup timeout and wait-strategy data.
 */
export const buildContainerSpec = (preset: ModulePreset, name: string, image: string): ContainerSpec => {
  let spec = newContainerSpec(image, name)
  spec = withEnvPairs(spec, preset.env)
  if (preset.ports.length > 0) spec = withExposedPorts(spec, ...preset.ports)
  if (preset.aliases.length > 0) spec = withNetworkAliases(spec, ...preset.aliases)
  if (preset.command !== undefined) spec = withCommand(spec, ...preset.command)
  if (preset.memoryLimitMb !== undefined) spec = withMemoryLimit(spec, preset.memoryLimitMb)
  if (preset.startupTimeoutMs !== undefined) spec = withStartupTimeout(spec, preset.startupTimeoutMs)
  return waitingFor(spec, preset.waitStrategy)
}

const applyOne = (
  transform: SpecTransform,
  spec: ContainerSpec,
  bindings: ReadonlyArray<PortBinding>,
): ContainerSpec =>
  Match.typeTags<SpecTransform>()({
    TemplateEnv: (templateEnv) =>
      withEnvPairs(spec, [[templateEnv.envKey, substituteMappedPorts(templateEnv.template, bindings)]]),
    TemplateCommand: (templateCommand) => ({
      ...spec,
      command: templateCommand.command.map((arg) => substituteMappedPorts(arg, bindings)),
    }),
    DropEnvWhenKey: (drop) => {
      const hasTrigger = spec.env.some(([key]) => key === drop.whenKey)
      return hasTrigger ? { ...spec, env: spec.env.filter(([key]) => key !== drop.dropKey) } : spec
    },
  })(transform)

/**
 * Applies every declared post-port-allocation transform (the upstream
 * `customizeSpec` hooks as data). Order matters and is the row's declared
 * order — upstream applied one hook per module, so rows today carry at most
 * one transform each.
 */
export const applySpecTransforms = (
  preset: ModulePreset,
  spec: ContainerSpec,
  bindings: ReadonlyArray<PortBinding>,
): ContainerSpec => {
  let out = spec
  for (const transform of preset.specTransforms) {
    out = applyOne(transform, out, bindings)
  }
  return out
}
