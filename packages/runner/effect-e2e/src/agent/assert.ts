import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'

import type { CacheStore } from '../cache/cache-store.service.js'
import type { Engine } from '../engine/engine.service.js'
import type { ModelGateway } from '../model/model.service.js'
import type { CheckRecord, VisionMode } from '../verdict/check.schema.js'
import type { CacheLookup, TokenUsage } from '../verdict/step-record.schema.js'
import { judged, JUDGMENT_POLL_INTERVAL, type JudgmentContext, type JudgmentFailure } from './judgment.js'
import type { SecretLedger } from './secret-ledger.service.js'

export interface AssertOptions {
  readonly vision?: VisionMode | undefined
  readonly timeout?: Duration.Input | undefined
  readonly maxModelCalls?: number | undefined
}

export interface AssertRequest extends AssertOptions {
  readonly context: JudgmentContext
  readonly statement: string
}

export interface AssertResult {
  readonly record: CheckRecord
  readonly lookup: CacheLookup
  readonly modelCalls: number
  readonly tokens: TokenUsage
}

export type AssertFailure = JudgmentFailure

const orDefault = <A>(value: A | undefined, fallback: A): A => value ?? fallback

export const assert = (
  request: AssertRequest,
): Effect.Effect<AssertResult, AssertFailure, Engine | ModelGateway | CacheStore | SecretLedger> =>
  judged({
    context: request.context,
    mode: 'assert',
    sentence: request.statement,
    vision: orDefault(request.vision, false),
    timeout: Duration.fromInputUnsafe(orDefault(request.timeout, request.context.timeout)),
    interval: JUDGMENT_POLL_INTERVAL,
    maxModelCalls: orDefault(request.maxModelCalls, request.context.agent.config.maxModelCalls),
  })
