import { Schema } from 'effect'

/**
 * The retry loop spent every attempt the budget allowed and the engine still raised a re-runnable
 * abort (a serialization failure or a deadlock). `attempts` names how many runs were spent — what
 * distinguishes this from a single `40001` — and `lastCause` carries the failure that ended the run,
 * so a caller branches on this variant rather than reading the store's last cause.
 */
export class SerializationBudgetExhausted extends Schema.TaggedError<SerializationBudgetExhausted>()(
  'SerializationBudgetExhausted',
  {
    attempts: Schema.Int,
    lastCause: Schema.Unknown,
  },
) {
  override get message(): string {
    return `the engine refused all ${this.attempts} run(s) of the unit`
  }
}
