import { Cell, Wire } from '@systemfsoftware/effect-cell-types'
import { Context, Effect, Exit, Layer, pipe, Result, Schema as S } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import type { HookSettings } from './HookSettings.schema.js'
import { SettingsJSON } from './HookSettings.schema.js'
import { collectSettingsGapsWithPaths } from './internal/CollectSettingsGapsExecutor.js'
import { loadPluginHookSources } from './internal/PluginHookSources.js'
import { MANAGED_SETTINGS_PATH, settingsPaths } from './internal/SettingsPaths.js'
import {
  type MergeCommand,
  type MergedSnapshot,
  mergeEffectiveSettings,
  packMergeCommand,
  type SettingsDecisionError,
  snapshotSettings,
} from './MergeSettings.workflow.js'

const SettingsJsonWire = Wire.mint(SettingsJSON)

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

interface SettingsFileText {
  readonly path: string
  readonly content: string
}

interface LoadSettingsRaw {
  readonly texts: readonly SettingsFileText[]
  readonly pluginSources: readonly {
    readonly settings: HookSettings
    readonly managed: boolean
    readonly pluginRoot?: string
  }[]
}

interface LoadSettingsPhases extends Cell.Phases {
  readonly command: { readonly cwd: string; readonly homeDir: string }
  readonly raw: LoadSettingsRaw
  readonly decoded: MergeCommand
  readonly decision: MergedSnapshot
  readonly decisionError: SettingsDecisionError
  readonly output: HookSettings | null
  readonly response: HookSettings | null
  readonly decodeError: never
  readonly readError: never
  readonly writeError: never
  readonly readContext: FileSystem
  readonly writeContext: never
}

const readSettingsTexts = (cwd: string, homeDir: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem
    const paths = settingsPaths(homeDir, cwd)
    const plugin = yield* loadPluginHookSources(homeDir, cwd)
    const texts = yield* Effect.forEach(
      paths,
      (path) =>
        Effect.map(fs.readFileString(path).pipe(Effect.orElseSucceed(() => '')), (content) => ({ path, content })),
      { concurrency: 'unbounded' },
    )
    return { texts, pluginSources: plugin.sources }
  })

const decodeSources = (raw: LoadSettingsRaw): Result.Result<MergeCommand, never> => {
  const fromFiles = raw.texts.flatMap(({ path, content }) => {
    if (content === '') return []
    const jsonOrError = S.decodeUnknownExit(S.fromJsonString(S.Record(S.String, S.Unknown)))(content)
    if (Exit.isFailure(jsonOrError)) return []
    const decoded = S.decodeUnknownExit(SettingsJsonWire)(jsonOrError.value)
    if (Exit.isFailure(decoded)) return []
    return [{
      settings: decoded.value,
      managed: path === MANAGED_SETTINGS_PATH,
    }]
  })
  return Result.succeed(packMergeCommand([...fromFiles, ...raw.pluginSources]))
}

const loadSettingsDescription = pipe(
  Cell.read<LoadSettingsPhases>(({ cwd, homeDir }) => readSettingsTexts(cwd, homeDir)),
  Cell.decode<LoadSettingsPhases>(decodeSources),
  Cell.decide<LoadSettingsPhases>(mergeEffectiveSettings),
  Cell.encode<LoadSettingsPhases>((outcome) =>
    Result.match(outcome, {
      onFailure: () => null,
      onSuccess: snapshotSettings,
    })
  ),
  Cell.write<LoadSettingsPhases>((snapshot) => Effect.succeed(snapshot)),
)

export const ClaudeSettingsLive = Layer.succeed(
  ClaudeSettings,
  ClaudeSettings.of({
    load: (cwd, homeDir) => Cell.apply(loadSettingsDescription, { cwd, homeDir }),
    gaps: (cwd, homeDir) => collectSettingsGapsWithPaths(settingsPaths(homeDir, cwd), homeDir, cwd),
  }),
)
