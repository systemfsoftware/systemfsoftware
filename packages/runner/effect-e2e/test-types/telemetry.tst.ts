import type * as Effect from 'effect/Effect'
import type * as Scope from 'effect/Scope'
import { describe, expect, it } from 'tstyche'

import type {
  TelemetryAttributeValue,
  TelemetryCount,
  TelemetryShape,
  TelemetrySpan,
  TelemetrySpanFn,
} from '../src/run/mod.js'

describe('Telemetry', () => {
  it('names its span contract once', () => {
    expect<TelemetryShape['span']>().type.toBe<TelemetrySpanFn>()
  })
  it('opens a span without narrowing the wrapped requirement channel', () => {
    expect<
      (
        name: string,
        attributes: Readonly<Record<string, TelemetryAttributeValue>>,
        use: (span: TelemetrySpan) => Effect.Effect<number, string, Scope.Scope>,
      ) => Effect.Effect<number, string, Scope.Scope>
    >().type.toBeAssignableFrom<TelemetryShape['span']>()
  })

  it('counts only the events design §14 names', () => {
    expect<TelemetryCount>().type.not.toBeAssignableFrom<{ readonly _tag: 'AssertOutcome' }>()
  })
})
