import * as S from 'effect/Schema'

/**
 * The command runner was asked for something it cannot do.
 *
 * It runs one command and reads the exit code, so it can neither select
 * individual test files nor report which tests ran. Asking it for `--testFiles`
 * is a configuration mistake, not a run failure, which is why this exits 2 and
 * names the runner: the user has to change the option or the runner.
 */
export class CommandRunnerUnsupportedOption
  extends S.TaggedError<CommandRunnerUnsupportedOption>()('CommandRunnerUnsupportedOption', {
    option: S.String,
  })
{
  readonly exitClass = 'ConfigError' as const
}

declare global {
  var __mutantCoverage__: unknown
}
