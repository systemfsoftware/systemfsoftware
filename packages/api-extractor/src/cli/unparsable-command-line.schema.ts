import { Runtime, Schema } from 'effect'

export class UnparsableCommandLine extends Schema.TaggedError<UnparsableCommandLine>()('UnparsableCommandLine', {}) {
  override readonly [Runtime.errorExitCode] = 2
  override readonly [Runtime.errorReported] = true

  override get message(): string {
    return 'The command line could not be parsed; the command-line framework already printed why'
  }
}
