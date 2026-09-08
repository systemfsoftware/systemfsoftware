import * as S from 'effect/Schema'

export class InstrumenterFailed extends S.TaggedError<InstrumenterFailed>()('InstrumenterFailed', {
  message: S.String,
  cause: S.Defect(),
}) {
  override get message(): string {
    if (this.message.length === 0) {
      return 'Instrumenter failure'
    }
    return this.message
  }
}
