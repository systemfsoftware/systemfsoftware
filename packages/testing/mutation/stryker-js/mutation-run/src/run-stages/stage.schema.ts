import * as S from 'effect/Schema'

import { ExitClass } from '../exit-classification.js'

const TypeId = '~stryker/mutation-run/StageError' as const

export class StageError extends S.TaggedError<StageError>(TypeId)('StageError', {
  stage: S.Literals(['prepare', 'instrument', 'dryRun', 'dryRunNoTests']),
  reason: S.String,
  cause: S.optional(S.Defect()),
  command: S.optional(S.String),
}) {
  readonly [TypeId] = TypeId

  get exitClass(): ExitClass {
    switch (this.stage) {
      case 'prepare':
      case 'dryRunNoTests':
        return ExitClass.ConfigError
      case 'instrument':
      case 'dryRun':
        return ExitClass.RuntimeError
    }
  }

  override get message(): string {
    const label = this.stage === 'prepare'
      ? 'Prepare'
      : this.stage === 'instrument'
      ? 'Instrument'
      : 'Dry run'
    const base = `${label} failed: ${this.reason}`
    return this.command ? `${base} (command: ${this.command})` : base
  }
}
