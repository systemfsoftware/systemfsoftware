import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'

import type { CacheStore } from '../cache/cache-store.service.js'
import type { Engine } from '../engine/engine.service.js'
import type { ModelGateway } from '../model/model.service.js'
import type { CheckRecord, VisionMode } from '../verdict/check.schema.js'
import type { CacheLookup, TokenUsage } from '../verdict/step-record.schema.js'
import { judged, JUDGMENT_POLL_INTERVAL, type JudgmentContext, type JudgmentFailure } from './judgment.js'
import type { SecretLedger } from './secret-ledger.service.js'

const DEFAULT_WAIT_FOR_TIMEOUT: Duration.Input = Duration.seconds(30)

export interface WaitForOptions {
  readonly vision?: VisionMode | undefined
  readonly interval?: Duration.Input | undefined
  readonly timeout?: Duration.Input | undefined
  readonly maxModelCalls?: number | undefined
}

export interface WaitForRequest extends WaitForOptions {
  readonly context: JudgmentContext
  readonly condition: string
}

export interface WaitForResult {
  readonly record: CheckRecord
  readonly lookup: CacheLookup
  readonly modelCalls: number
  readonly tokens: TokenUsage
}

export type WaitForFailure = JudgmentFailure

const orDefault = <A>(value: A | undefined, fallback: A): A => value ?? fallback

export const waitFor = (
  request: WaitForRequest,
): Effect.Effect<WaitForResult, WaitForFailure, Engine | ModelGateway | CacheStore | SecretLedger> =>
  judged({
    context: request.context,
    mode: 'waitFor',
    sentence: request.condition,
    vision: orDefault(request.vision, false),
    timeout: Duration.fromInputUnsafe(orDefault(request.timeout, DEFAULT_WAIT_FOR_TIMEOUT)),
    interval: Duration.fromInputUnsafe(orDefault(request.interval, JUDGMENT_POLL_INTERVAL)),
    maxModelCalls: orDefault(request.maxModelCalls, request.context.agent.config.maxModelCalls),
  })
