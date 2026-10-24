import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'

import type { Action } from '../engine/action.schema.js'
import type { ModelResponse } from '../model/model.schema.js'
import type { ModelGatewayShape } from '../model/model.service.js'
import type {
  TelemetryAttributeValue,
  TelemetryCount,
  TelemetryShape,
  TelemetrySpan,
} from '../run/telemetry.service.js'
import type { CacheLookup, TokenUsage } from '../verdict/step-record.schema.js'
import type { ActContext } from './act.js'

type TelemetryAttributes = Readonly<Record<string, TelemetryAttributeValue>>

export type CacheOutcome = 'replayed' | 'handed_off' | 'missed' | 'off'

export interface Metered {
  readonly lookup: CacheLookup
  readonly modelCalls: number
  readonly tokens: TokenUsage
}

export const annotated = (span: TelemetrySpan) => (attributes: TelemetryAttributes): Effect.Effect<void> =>
  Effect.sync(() => Object.entries(attributes).forEach(([key, value]) => span.set(key, value)))

export const stepAttributesOf = (context: Pick<ActContext, 'stepIndex' | 'cache'>): TelemetryAttributes => ({
  'e2e.test.id': context.cache.test,
  'e2e.target': context.cache.target,
  'e2e.step.index': context.stepIndex,
})

export const cacheOutcomeOf = (lookup: CacheLookup): CacheOutcome =>
  Match.valueTags(lookup, {
    Replayed: (): CacheOutcome => 'replayed',
    HandedOff: (): CacheOutcome => 'handed_off',
    Missed: (): CacheOutcome => 'missed',
    Off: (): CacheOutcome => 'off',
  })

const replayCountsOf = (lookup: CacheLookup): ReadonlyArray<TelemetryCount> =>
  Match.valueTags(lookup, {
    Replayed: (): ReadonlyArray<TelemetryCount> => [{ _tag: 'ReplayOutcome', outcome: 'replayed' }],
    HandedOff: (): ReadonlyArray<TelemetryCount> => [{ _tag: 'ReplayOutcome', outcome: 'handed_off' }],
    Missed: (): ReadonlyArray<TelemetryCount> => [{ _tag: 'ReplayOutcome', outcome: 'missed' }],
    Off: (): ReadonlyArray<TelemetryCount> => [],
  })

export const countsOf = (metered: Metered): ReadonlyArray<TelemetryCount> => [
  ...replayCountsOf(metered.lookup),
  { _tag: 'ModelCalls', calls: metered.modelCalls },
  { _tag: 'ModelTokens', kind: 'input', tokens: metered.tokens.input },
  { _tag: 'ModelTokens', kind: 'output', tokens: metered.tokens.output },
]

export const counted = (telemetry: TelemetryShape) => (metered: Metered): Effect.Effect<void> =>
  Effect.forEach(countsOf(metered), telemetry.count, { discard: true })

const responseAttributesOf = (response: ModelResponse): TelemetryAttributes => ({
  'gen_ai.provider.name': response.served.provider,
  'gen_ai.response.model': response.served.model,
  'gen_ai.usage.input_tokens': response.usage.input,
  'gen_ai.usage.output_tokens': response.usage.output,
  'gen_ai.response.finish_reasons': [response.finishReason],
})

export const spannedGateway = (telemetry: TelemetryShape) => (gateway: ModelGatewayShape): ModelGatewayShape => ({
  complete: (request) =>
    telemetry.span(
      'e2e.model.call',
      { 'gen_ai.operation.name': 'chat', 'gen_ai.request.model': request.model },
      (span) => Effect.tap(gateway.complete(request), (response) => annotated(span)(responseAttributesOf(response))),
    ),
})

const locatorLabelOf = (action: Action): Option.Option<string> =>
  Match.value(action).pipe(
    Match.tag('Tap', 'Fill', 'Type', 'Press', 'Select', 'Check', 'Hover', ({ target }) => Option.some(target.label)),
    Match.tag('Drag', ({ from }) => Option.some(from.label)),
    Match.tag('WaitFor', ({ locator }) => Option.some(locator.label)),
    Match.orElse(() => Option.none<string>()),
  )

export const engineActionAttributesOf = (redact: (text: string) => string) => (action: Action): TelemetryAttributes =>
  Option.match(locatorLabelOf(action), {
    onNone: (): TelemetryAttributes => ({ 'e2e.action.kind': action._tag }),
    onSome: (label): TelemetryAttributes => ({ 'e2e.action.kind': action._tag, 'e2e.locator.label': redact(label) }),
  })
