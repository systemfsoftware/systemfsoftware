import { Context, Effect, Layer } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import type { HookSettings } from './HookSettings.schema.js'
import { collectSettingsGapsWithPaths } from './internal/CollectSettingsGapsExecutor.js'
import { loadSettingsWithPaths } from './internal/LoadSettingsExecutor.js'
import { settingsPaths } from './internal/SettingsPaths.js'

export interface SettingsGaps {
  readonly coverage: {
    readonly unrecognized: readonly { readonly event: string; readonly reason: string }[]
    readonly notCarried: readonly { readonly event: string; readonly reason: string }[]
    readonly matcherNotEvaluable: readonly { readonly event: string; readonly reason: string }[]
    readonly matcherOutOfReach: readonly { readonly event: string; readonly reason: string }[]
    readonly shadowed: readonly { readonly event: string; readonly reason: string }[]
    readonly disabled: readonly { readonly event: string; readonly reason: string }[]
  }
  readonly unsupportedHookTypes: readonly string[]
  readonly malformedFiles: readonly string[]
}

export class ClaudeSettings extends Context.Service<
  ClaudeSettings,
  {
    readonly load: (cwd: string, homeDir: string) => Effect.Effect<HookSettings | null, never, FileSystem>
    readonly gaps: (cwd: string, homeDir: string) => Effect.Effect<SettingsGaps, never, FileSystem>
  }
>()('@systemfsoftware/omp-claude-compat/ClaudeSettings') {}

export const ClaudeSettingsLive = Layer.succeed(
  ClaudeSettings,
  ClaudeSettings.of({
    load: (cwd, homeDir) => loadSettingsWithPaths(settingsPaths(homeDir, cwd), homeDir, cwd),
    gaps: (cwd, homeDir) => collectSettingsGapsWithPaths(settingsPaths(homeDir, cwd), homeDir, cwd),
  }),
)
