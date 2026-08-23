/** @internal */
export const PollLoopTag = { _tag: 'Poll' } as const
/** @internal */
export type PollLoopTag = typeof PollLoopTag

/** @internal */
export const StreamLoopTag = { _tag: 'Stream' } as const
/** @internal */
export type StreamLoopTag = typeof StreamLoopTag

/** @internal */
export const SubscriptionLoopTag = { _tag: 'Subscription' } as const
/** @internal */
export type SubscriptionLoopTag = typeof SubscriptionLoopTag
