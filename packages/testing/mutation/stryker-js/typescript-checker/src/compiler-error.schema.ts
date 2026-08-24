import * as S from 'effect/Schema'

const TypeId = '~stryker/typescript-checker/CompilerFailed' as const

/**
 * Every way the TypeScript compiler can fail while serving a check.
 *
 * One tagged error rather than four, because nothing branches on which of these
 * happened — they all reach the caller as a failed check. The `reason` keeps the
 * cases distinguishable in a report without inventing four types no consumer
 * discriminates.
 */
export class CompilerFailed extends S.TaggedError<CompilerFailed>(TypeId)('CompilerFailed', {
  reason: S.Literals(['not-initialized', 'no-projects', 'unknown-file-node', 'file-not-in-project']),
  /** The file or tsconfig the failure is about, when it is about one. */
  subject: S.optional(S.String),
}) {
  readonly [TypeId] = TypeId

  override get message(): string {
    switch (this.reason) {
      case 'not-initialized':
        return 'The TypeScript compiler was used before it was initialized'
      case 'no-projects':
        return `No projects were found for ${this.subject ?? 'the tsconfig'}`
      case 'unknown-file-node':
        return `The file graph has no node for '${this.subject ?? 'a file'}', which should not happen`
      case 'file-not-in-project':
        return `'${this.subject ?? 'a file'}' is part of your TypeScript project but could not be found on disk`
    }
  }
}
