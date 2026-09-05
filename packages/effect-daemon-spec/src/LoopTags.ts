/**
 * Discriminants on the public Worker loop variants.
 *
 * These tags are part of the published type identity of `poll`, `stream`,
 * and `subscription`. They are not unpublished wiring.
 */
export const PollLoopTag = { _tag: 'Poll' } as const
export type PollLoopTag = typeof PollLoopTag

export const StreamLoopTag = { _tag: 'Stream' } as const
export type StreamLoopTag = typeof StreamLoopTag

export const SubscriptionLoopTag = { _tag: 'Subscription' } as const
export type SubscriptionLoopTag = typeof SubscriptionLoopTag
