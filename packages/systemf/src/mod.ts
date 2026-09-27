export { check } from './check/check.js'
export type { CheckRequest } from './check/check.js'
export { unitList, unitShow } from './check/inspect.js'
export type { UnitListRequest, UnitShowRequest } from './check/inspect.js'
export { runSystemf } from './commands/root.js'
export type { CliRun } from './commands/root.js'
export { EXIT_OF_ERROR, SystemfError } from './contract/errors.js'
export { API_VERSION, EXIT_CLEAN, EXIT_FINDINGS, EXIT_USAGE, exitCodeOfCheck } from './contract/result.js'
export type {
  CheckData,
  CheckedPackage,
  CheckSummary,
  Coverage,
  ErrorCode,
  ErrorCodeInfo,
  ExitCodeInfo,
  Finding,
  ManifestArgument,
  ManifestCommand,
  ManifestData,
  ManifestExample,
  ManifestFlag,
  Reach,
  ReachMode,
  ResultType,
  RuleId,
  UnitKindName,
  UnitListData,
  UnitRow,
  UnitShowData,
} from './contract/result.js'
export { manifestOf } from './manifest/walk.js'

import { Effect, Option } from 'effect'
import type { Command } from 'effect/unstable/cli'
import { cwdSetting, rootCommand } from './commands/root.js'
import type { SystemfError } from './contract/errors.js'
import type { ManifestData } from './contract/result.js'
import { manifestOf } from './manifest/walk.js'

export const manifest: Effect.Effect<ManifestData, SystemfError, Command.Environment> = manifestOf(rootCommand).pipe(
  Effect.provideService(cwdSetting, Option.none()),
)
