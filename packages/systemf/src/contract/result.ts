import { ApiVersion } from './result.schema.js'
import type { CheckData, ErrorCode, ExitCodeInfo } from './result.schema.js'

export * from './result.schema.js'

export const API_VERSION: ApiVersion = ApiVersion.literal

export const ERROR_MEANINGS: Readonly<Record<ErrorCode, string>> = {
  ERR_UNKNOWN: 'a failure the command cannot name more precisely',
  ERR_UNKNOWN_COMMAND: 'the command or subcommand does not exist',
  ERR_INVALID_OPTION: 'an option is unknown, repeated, or carries a value it rejects',
  ERR_INVALID_ARGUMENT: 'a positional argument is unexpected or carries a value it rejects',
  ERR_MISSING_ARGUMENT: 'a required argument or option was not given',
  ERR_NOT_A_PACKAGE: 'the path is not a package (no readable package.json)',
  ERR_TSCONFIG_NOT_FOUND: 'the package has no tsconfig the check can load',
  ERR_UNKNOWN_RULE: 'the rule id given to --only does not exist',
  ERR_UNKNOWN_UNIT: 'no unit matches the module path or export name',
  ERR_AMBIGUOUS_UNIT: 'more than one unit matches the module path or export name',
}

export const EXIT_CODES: readonly ExitCodeInfo[] = [
  { code: 0, meaning: 'clean: every enrolled unit is reached by a stop check' },
  { code: 1, meaning: 'findings: at least one rule failed' },
  { code: 2, meaning: 'usage error, or a check that could not run' },
]

export const EXIT_CLEAN = 0
export const EXIT_FINDINGS = 1
export const EXIT_USAGE = 2

export const exitCodeOfCheck = (data: CheckData): number => data.findings.length === 0 ? EXIT_CLEAN : EXIT_FINDINGS
