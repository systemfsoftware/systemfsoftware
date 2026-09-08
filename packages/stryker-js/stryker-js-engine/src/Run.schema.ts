import * as S from 'effect/Schema'

import type { ExitClass } from '@systemfsoftware/stryker-js/ExitClass'

export const StageCommand = S.NonEmptyString.pipe(S.brand('StageCommand'))
export type StageCommand = typeof StageCommand.Type

const TypeId = '~stryker/mutation-run/StageError' as const

export class StageError extends S.TaggedError<StageError>(TypeId)('StageError', {
  stage: S.Literals(['prepare', 'instrument', 'dryRun', 'dryRunNoTests', 'mutationTest']),
  reason: S.String,
  cause: S.optional(S.Defect()),
  command: S.optional(StageCommand),
}) {
  readonly [TypeId] = TypeId

  get exitClass(): ExitClass {
    switch (this.stage) {
      case 'prepare':
      case 'dryRunNoTests':
        return 'ConfigError'
      case 'instrument':
      case 'dryRun':
      case 'mutationTest':
        return 'RuntimeError'
    }
  }

  override get message(): string {
    let label = 'Dry run'
    switch (this.stage) {
      case 'prepare': {
        label = 'Prepare'
        break
      }
      case 'instrument': {
        label = 'Instrument'
        break
      }
      case 'mutationTest': {
        label = 'Mutation testing'
        break
      }
      case 'dryRun':
      case 'dryRunNoTests': {
        break
      }
    }
    const base = `${label} failed: ${this.reason}`
    if (this.command !== undefined && this.command !== '') {
      return `${base} (command: ${this.command})`
    }
    return base
  }
}

export class PrepareError extends S.TaggedError<PrepareError>()('PrepareError', {
  stage: S.Literal('prepare'),
  reason: S.String,
}) {}
