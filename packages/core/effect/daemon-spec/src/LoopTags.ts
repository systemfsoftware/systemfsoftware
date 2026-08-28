/**
 * Discriminants on the public Worker loop variants.
 *
 * These tags are part of the published type identity of `poll`, `stream`,
 * and `subscription`. They are not unpublished wiring.
 * @public
 */
export const PollLoopTag = { _tag: 'Poll' } as const
/** @public */
export type PollLoopTag = typeof PollLoopTag

/** @public */
export const StreamLoopTag = { _tag: 'Stream' } as const
/** @public */
export type StreamLoopTag = typeof StreamLoopTag

/** @public */
export const SubscriptionLoopTag = { _tag: 'Subscription' } as const
/** @public */
export type SubscriptionLoopTag = typeof SubscriptionLoopTag
