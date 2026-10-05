import { Array as Arr, Option, Schema } from 'effect'
import { EffectPluginBlock, PluggablePreset } from './EffectPluginBlock.schema.js'
import type { Raw } from './json.js'

export const DEFAULT_PLUGIN_BASE: EffectPluginBlock = {
  name: '@effect/language-service',
  diagnosticSeverity: {},
}

export const effectPluginBaseOf = (preset: Raw): EffectPluginBlock | undefined =>
  Option.getOrUndefined(
    Option.flatMap(
      Schema.decodeUnknownOption(PluggablePreset)(preset),
      (parsed) =>
        Option.flatMap(
          Option.fromNullishOr(parsed.compilerOptions?.plugins),
          (plugins) => Arr.findFirst(plugins, (plugin) => Schema.decodeUnknownOption(EffectPluginBlock)(plugin)),
        ),
    ),
  )
