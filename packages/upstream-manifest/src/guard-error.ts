import { Schema } from 'effect'

/** A refusal the guard names rather than throws: every failure of the shell is one of these. */
export class GuardError extends Schema.TaggedError('GuardError')<{ message: string }> {}
