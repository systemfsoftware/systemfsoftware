import { Schema } from 'effect'

/**
 * Why a medium's readiness signal can fail (R6, R10): the child's run ended
 * before it ever signalled ready, however it ended. The kernel's readiness
 * watcher emits no `ChildReady` for such a child — the termination watch reports
 * its end — so completing readiness on such an end would fabricate a
 * child-ready the fiber reference never shows.
 */
export class ChildEndedBeforeReady extends Schema.TaggedError<ChildEndedBeforeReady>()(
  'ChildEndedBeforeReady',
  {},
) {}
