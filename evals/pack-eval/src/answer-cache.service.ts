import { Context, type Effect, type Option } from 'effect'
import type { AnswerCacheFailure } from './selection-trace.schema.js'

export interface AnswerCacheKey {
  readonly role: string
  readonly model: string
  readonly promptDigest: string
}

export interface CachedAnswer {
  readonly servedModel: string
  readonly payload: string
}

export interface AnswerCacheShape {
  readonly get: (key: AnswerCacheKey) => Effect.Effect<Option.Option<CachedAnswer>, AnswerCacheFailure>
  readonly set: (key: AnswerCacheKey, answer: CachedAnswer) => Effect.Effect<void, AnswerCacheFailure>
}

export class AnswerCache extends Context.Service<AnswerCache, AnswerCacheShape>()(
  '@systemfsoftware/pack-eval/AnswerCache',
) {}
