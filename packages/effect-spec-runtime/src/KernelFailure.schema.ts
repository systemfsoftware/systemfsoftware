import { Schema } from 'effect'

/**
 * The kernel's own failure — a deadlock, an escape, a wait it cannot observe, or a runaway run — as a failure
 * value carrying the message the record's headline shows (R1, R2). It is a value, not a formatted string, so the
 * renderer reads its first location from the innermost unfinished cell span's decide site.
 */
export class KernelFailure extends Schema.TaggedError<KernelFailure>()('KernelFailure', {
  detail: Schema.String,
}) {
  override get message(): string {
    return this.detail
  }
}
