import { Runtime, Schema } from 'effect'

export class UnparsableCommandLine extends Schema.TaggedError<UnparsableCommandLine>()('UnparsableCommandLine', {}) {
  override readonly [Runtime.errorExitCode] = 2
  override readonly [Runtime.errorReported] = true
}
