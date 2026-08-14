import { describe, expect, it } from '@effect/vitest'
import { Cause, Equal, Hash, Option, Predicate, Result as EffectResult, Schema } from 'effect'
import { FastCheck as fc } from 'effect/testing'
import * as Result from '../src/Result.js'

const resultSchema = Result.Schema({ success: Schema.Number, error: Schema.String })
const arbResult = Schema.toArbitrary(resultSchema)(fc)

const TagError = Schema.TaggedStruct('T', { code: Schema.Number })
type TaggedError = Schema.Schema.Type<typeof TagError>
const arbTagged = Schema.toArbitrary(
  Result.Schema({ success: Schema.Number, error: Schema.Union([TagError, Schema.String]) }),
)(fc)
const interruptedResult = Result.failure(Cause.interrupt(1))

describe('Result core laws', () => {
  it.prop(
    'schema roundtrip preserves every state',
    [arbResult],
    ([result]) => Equal.equals(Schema.decodeSync(resultSchema)(Schema.encodeSync(resultSchema)(result)), result),
  )

  it.prop(
    'map with identity leaves the result unchanged',
    [arbResult],
    ([result]) => Equal.equals(Result.map(result, (n) => n), result),
  )

  it.prop('map composes', [arbResult], ([result]) =>
    Equal.equals(
      Result.map(Result.map(result, (n: number) => n + 1), (n) => n * 2),
      Result.map(result, (n: number) => (n + 1) * 2),
    ))

  it.prop('equal results hash equally', [arbResult], ([result]) => {
    const rebuilt = Result.match(result, {
      onInitial: (r) => Result.initial(r.waiting),
      onFailure: (r) => Result.failure(r.cause, { previousSuccess: r.previousSuccess, waiting: r.waiting }),
      onSuccess: (r) => Result.success(r.value, { waiting: r.waiting, timestamp: r.timestamp }),
    })
    return !Equal.equals(result, rebuilt) || Hash.hash(result) === Hash.hash(rebuilt)
  })

  it.prop(
    'all succeeds exactly when every entry succeeded',
    [arbResult, arbResult],
    ([first, second]) =>
      Result.isSuccess(Result.all([first, second])) === (Result.isSuccess(first) && Result.isSuccess(second)),
  )

  it.prop('replacePrevious swaps the remembered success of a failure', [arbResult, arbResult], ([result, other]) => {
    const replaced = Result.replacePrevious(result, Option.some(other))
    const expected = Result.isSuccess(other)
      ? Option.some(other)
      : Result.isFailure(other)
      ? other.previousSuccess
      : Option.none()
    return Result.isFailure(result)
      ? Result.isFailure(replaced) && Equal.equals(replaced.previousSuccess, expected)
      : Equal.equals(replaced, result)
  })

  it.prop('decoding rejects shapes that are not results', [
    Schema.toArbitrary(Schema.Unknown)(fc).filter((input) =>
      typeof input !== 'object' || input === null ||
      !('_tag' in input) ||
      (input._tag !== 'Initial' && input._tag !== 'Success' && input._tag !== 'Failure')
    ),
  ], ([garbage]) => Option.isNone(Schema.decodeUnknownOption(resultSchema)(garbage)))

  it.prop('all over a labeled set succeeds exactly when every entry succeeded and keeps the labels', [
    arbResult,
    arbResult,
  ], ([first, second]) => {
    const combined = Result.all({ first, second })
    if (!Result.isSuccess(combined)) {
      return !Result.isSuccess(first) || !Result.isSuccess(second)
    }
    return Result.isSuccess(first) && Result.isSuccess(second) &&
      Equal.equals(combined.value.first, first.value) && Equal.equals(combined.value.second, second.value)
  })

  it.prop('a failure rebuilt from its exit keeps the remembered success', [arbResult, arbResult], (
    [result, previous],
  ) =>
    !Result.isFailure(result) ||
    (() => {
      const rebuilt = Result.fromExitWithPrevious(Result.toExit(result), Option.some(previous))
      const expected = Result.isSuccess(previous)
        ? Option.some(previous)
        : Result.isFailure(previous)
        ? previous.previousSuccess
        : Option.none()
      return Result.isFailure(rebuilt) && Equal.equals(rebuilt.previousSuccess, expected)
    })())

  it.prop('builder routes a typed error through onError and everything else to the fallback', [arbResult], (
    [result],
  ) => {
    const routed = Result.builder(result).onError(() => 'typed' as const).orElse(() => 'other' as const)
    const hasTypedError = Result.isFailure(result) && EffectResult.isSuccess(Cause.findError(result.cause))
    return routed === (hasTypedError ? 'typed' : 'other')
  })

  it.prop(
    'results with different tags are never equal',
    [arbResult, arbResult],
    ([first, second]) => first._tag === second._tag || !Equal.equals(first, second),
  )

  it.prop(
    'marking a settled result as waiting flips only the waiting flag, and touching preserves tag and value',
    [arbResult],
    ([result]) => {
      const waited = Result.waiting(result)
      const touched = Result.waiting(result, { touch: true })
      const tagAndValuePreserved = Result.isInitial(result)
        ? Result.isInitial(waited) && Result.isInitial(touched)
        : Result.isSuccess(result)
        ? Result.isSuccess(waited) && Equal.equals(waited.value, result.value) &&
          Result.isSuccess(touched) && Equal.equals(touched.value, result.value)
        : Result.isFailure(waited) && Result.isFailure(touched)
      return waited.waiting === true && touched.waiting === true && tagAndValuePreserved
    },
  )

  it.prop('flatMap passes a failure through untouched', [arbResult], ([result]) =>
    !Result.isFailure(result) ||
    Equal.equals(Result.flatMap(result, (n: number) => Result.success(n + 1)), result))

  it.prop(
    'marking a result as waiting makes it unequal to its unmarked original',
    [arbResult],
    ([result]) =>
      result.waiting ? Equal.equals(result, Result.waiting(result)) : !Equal.equals(result, Result.waiting(result)),
  )

  it.prop('a bare failure raised from an error has no value and reports that error', [
    Schema.toArbitrary(Schema.String)(fc),
  ], ([message]) => {
    const bare = Result.failure(Cause.fail(message))
    return Option.isNone(Result.value(bare)) && Equal.equals(Result.error(bare), Option.some(message))
  })

  it.prop(
    'an exit roundtrip collapses a result to its bare value or cause',
    [arbResult],
    ([result]) =>
      Result.isInitial(result)
        ? Result.isFailure(Result.fromExit(Result.toExit(result)))
        : Result.isSuccess(result)
        ? Equal.equals(Result.fromExit(Result.toExit(result)), Result.success(result.value))
        : Equal.equals(Result.fromExit(Result.toExit(result)), Result.failure(result.cause)),
  )

  it.prop(
    'a successful exit supersedes any remembered previous result',
    [arbResult, arbResult],
    ([result, previous]) =>
      !Result.isSuccess(result) ||
      Equal.equals(
        Result.fromExitWithPrevious(Result.toExit(result), Option.some(previous)),
        Result.success(result.value),
      ),
  )

  it.prop('waiting from nothing yields a waiting initial state, and from a result reuses that result', [arbResult], (
    [result],
  ) => {
    const fromNothing = Result.waitingFrom(Option.none())
    const fromResult = Result.waitingFrom(Option.some(result))
    return Result.isInitial(fromNothing) && fromNothing.waiting === true &&
      Equal.equals(fromResult, Result.waiting(result))
  })

  it.prop('an interrupted result is a failure carrying no value or typed error', [
    arbResult,
    fc.constant(interruptedResult),
  ], ([result, interrupted]) =>
    Result.isInterrupted(interrupted) &&
    Result.isFailure(interrupted) &&
    Option.isNone(Result.value(interrupted)) &&
    Option.isNone(Result.error(interrupted)) &&
    !Result.isInterrupted(result))

  it.prop('mapping preserves the value carried by a result', [arbResult], ([result]) =>
    Equal.equals(
      Result.value(Result.map(result, (n: number) => n + 1)),
      Option.map(Result.value(result), (n: number) => n + 1),
    ))

  it.prop('mapping a failure maps its remembered success and keeps its cause', [arbResult], ([result]) => {
    if (!Result.isFailure(result)) {
      return true
    }
    const mapped = Result.map(result, (n: number) => n + 1)
    return Result.isFailure(mapped) && mapped.waiting === result.waiting &&
      Equal.equals(mapped.cause, result.cause) &&
      Equal.equals(mapped.previousSuccess, Option.map(result.previousSuccess, (s) => Result.success(s.value + 1, s)))
  })

  it.prop(
    'a cause is available exactly for failures',
    [arbResult],
    ([result]) =>
      Option.isSome(Result.cause(result)) === Result.isFailure(result) &&
      (!Result.isFailure(result) || Equal.equals(Result.cause(result), Option.some(result.cause))),
  )

  it.prop('a typed error is reported exactly for failures with a typed cause', [arbResult], ([result]) => {
    const err = Result.error(result)
    const hasTypedCause = Result.isFailure(result) && Option.isSome(Cause.findErrorOption(result.cause))
    return hasTypedCause ? Option.isSome(err) : Option.isNone(err)
  })

  it.prop('matching dispatches each state to its own handler', [arbResult], ([result]) => {
    const routed = Result.match(result, {
      onInitial: () => 'initial' as const,
      onFailure: () => 'failure' as const,
      onSuccess: () => 'success' as const,
    })
    return Result.isInitial(result)
      ? routed === 'initial'
      : Result.isSuccess(result)
      ? routed === 'success'
      : routed === 'failure'
  })

  it.prop('matching with an error splits failures into typed errors and defects', [arbResult], ([result]) => {
    const routed = Result.matchWithError(result, {
      onInitial: () => 'initial' as const,
      onError: () => 'error' as const,
      onDefect: () => 'defect' as const,
      onSuccess: () => 'success' as const,
    })
    if (Result.isInitial(result)) {
      return routed === 'initial'
    }
    if (Result.isSuccess(result)) {
      return routed === 'success'
    }
    return routed === (EffectResult.isSuccess(Cause.findError(result.cause)) ? 'error' : 'defect')
  })

  it.prop('waiting matching routes waiting states before the tag', [arbResult], ([result]) => {
    const routed = Result.matchWithWaiting(result, {
      onWaiting: () => 'waiting' as const,
      onError: () => 'error' as const,
      onDefect: () => 'defect' as const,
      onSuccess: () => 'success' as const,
    })
    if (result.waiting) {
      return routed === 'waiting'
    }
    if (Result.isInitial(result)) {
      return routed === 'waiting'
    }
    if (Result.isSuccess(result)) {
      return routed === 'success'
    }
    return routed === (EffectResult.isSuccess(Cause.findError(result.cause)) ? 'error' : 'defect')
  })

  it.prop(
    'flatMap keeps initial results untouched and applies its function to successes',
    [arbResult],
    ([result]) =>
      Result.isInitial(result)
        ? Equal.equals(Result.flatMap(result, () => Result.success(0)), result)
        : Result.isSuccess(result)
        ? Equal.equals(Result.flatMap(result, (n: number) => Result.success(n + 1)), Result.success(result.value + 1))
        : true,
  )

  it.prop('flatMap with a failing function drops the remembered success', [arbResult], ([result]) => {
    if (!Result.isFailure(result)) {
      return true
    }
    const mapped = Result.flatMap(result, () => Result.failure(Cause.fail('nope')))
    return Result.isFailure(mapped) && Option.isNone(mapped.previousSuccess) && mapped.waiting === result.waiting &&
      Equal.equals(mapped.cause, result.cause)
  })

  it.prop('combining mixed entries passes plain values through and stops at the first failure', [
    arbResult,
    arbResult,
  ], ([first, second]) => {
    const list = Result.all([first, 7, second])
    const record = Result.all({ first, marker: 7, second })
    const bothSucceeded = Result.isSuccess(first) && Result.isSuccess(second)
    const listOk = Result.isSuccess(list)
      ? bothSucceeded && Equal.equals(list.value[0], first.value) && Equal.equals(list.value[1], 7) &&
        Equal.equals(list.value[2], second.value)
      : !bothSucceeded
    const recordOk = Result.isSuccess(record)
      ? bothSucceeded && Equal.equals(record.value.first, first.value) &&
        Equal.equals(record.value.marker, 7) && Equal.equals(record.value.second, second.value)
      : !bothSucceeded
    return listOk && recordOk
  })

  it.prop('the builder fires only the first matching handler', [arbResult], ([result]) => {
    const routed = Result.builder(result)
      .onInitial(() => 'initial' as const)
      .onWaiting(() => 'waiting' as const)
      .onSuccess(() => 'success' as const)
      .onFailure(() => 'failure' as const)
      .orElse(() => 'other' as const)
    const expected = Result.isInitial(result)
      ? 'initial'
      : result.waiting
      ? 'waiting'
      : Result.isSuccess(result)
      ? 'success'
      : 'failure'
    return routed === expected
  })

  it.prop('the builder treats initial and waiting states as one case', [arbResult], ([result]) => {
    const fired = Result.builder(result).onInitialOrWaiting(() => true).orElse(() => false)
    return fired === (Result.isInitial(result) || result.waiting)
  })

  it.prop('tagged error matching fires only when the failure carries that tag', [arbTagged], ([result]) => {
    const byTag = Result.builder(result).onErrorTag('T', (e) => e.code).orElse(() => -1)
    const byTags = Result.builder(result).onErrorTag(['T'], (e) => e.code).orElse(() => -1)
    const expected = Result.isFailure(result)
      ? Option.getOrElse(
        Option.map(
          Option.filter(
            Cause.findErrorOption(result.cause),
            (e): e is TaggedError => Predicate.hasProperty(e, '_tag') && e._tag === 'T',
          ),
          (e) => e.code,
        ),
        () => -1,
      )
      : -1
    return Equal.equals(byTag, expected) && Equal.equals(byTags, expected)
  })

  it.prop('the builder reports defects only for defect failures', [arbResult], ([result]) => {
    const fired = Result.builder(result).onDefect(() => true).orElse(() => false)
    return fired === (Result.isFailure(result) && EffectResult.isSuccess(Cause.findDefect(result.cause)))
  })

  it.prop('the builder passes the defect itself to its handler', [arbResult], ([result]) => {
    if (!Result.isFailure(result)) {
      return Result.builder(result).onSuccess(() => 's').orElse(() => 'o') ===
        (Result.isSuccess(result) ? 's' : 'o')
    }
    const handled = Result.builder(result).onDefect((received) => received).orElse(() => null)
    return EffectResult.isSuccess(Cause.findDefect(result.cause))
      ? Equal.equals(handled, Cause.squash(result.cause))
      : handled === null
  })

  it.prop('an exhaustive builder renders the handled case', [
    fc.constant(Result.fail<TaggedError>({ _tag: 'T', code: 7 })),
  ], ([result]) => {
    const rendered = Result.builder(result)
      .onErrorTag('T', (e) => `missing:${e.code}`)
      .onDefect(() => 'defect')
      .onInterrupt(() => 'interrupt')
      .exhaustive()
    return rendered === 'missing:7'
  })

  it.prop(
    'a builder with no matching handlers renders nothing',
    [arbResult],
    ([result]) => Result.builder(result).orNull() === null,
  )

  it.prop('the builder reports interruptions only for interrupted failures', [
    arbResult,
    fc.constant(interruptedResult),
  ], ([result, interrupted]) => {
    const onResult = Result.builder(result).onInterrupt(() => true).orElse(() => false)
    const onInterrupted = Result.builder(interrupted).onInterrupt(() => true).orElse(() => false)
    return onResult === false && onInterrupted === true
  })

  it.prop(
    'rendering reports a handled success, nothing for unhandled non-failures, and throws for unhandled failures',
    [arbResult],
    ([result]) => {
      if (Result.isSuccess(result)) {
        return Equal.equals(Result.builder(result).onSuccess((n: number) => n + 1).render(), result.value + 1)
      }
      if (Result.isInitial(result)) {
        return Result.builder(result).render() === null
      }
      let threw = false
      try {
        Result.builder(result).render()
      } catch {
        threw = true
      }
      return threw
    },
  )

  it.prop('a schema without a value schema rejects successes and remembered successes', [arbResult], ([result]) => {
    const noValue = Result.Schema({ error: Schema.String })
    const decoded = Schema.decodeUnknownOption(noValue)(Schema.encodeSync(resultSchema)(result))
    const expectRejected = Result.isSuccess(result) ||
      (Result.isFailure(result) && Option.isSome(result.previousSuccess))
    return expectRejected ? Option.isNone(decoded) : Option.isSome(decoded)
  })

  it.prop('the wire codec roundtrips every state through its encoded form', [arbResult], ([result]) => {
    const codec = Schema.toCodecJson(resultSchema)
    return Equal.equals(Schema.decodeSync(codec)(Schema.encodeSync(codec)(result)), result)
  })

  it('formatting renders each state to its canonical string', () => {
    const format = Schema.toFormatter(resultSchema)
    expect(format(Result.initial(false))).toBe('Result.Initial(false)')
    expect(format(Result.initial(true))).toBe('Result.Initial(true)')
    expect(format(Result.success(1, { timestamp: 0 }))).toBe('Result.Success(1, false, 0)')
  })

  it.prop('formatting renders every state to a named string', [arbResult], ([result]) => {
    const formatted = Schema.toFormatter(resultSchema)(result)
    return typeof formatted === 'string' && formatted.length > 0
  })

  it.prop(
    'a result composes through pipe like a direct call',
    [arbResult],
    ([result]) => Equal.equals(result.pipe(Result.map((n: number) => n + 1)), Result.map(result, (n: number) => n + 1)),
  )

  it.prop('a builder composes through pipe', [arbResult], ([result]) =>
    Equal.equals(
      Result.builder(result).pipe((b) => b.onSuccess((n: number) => n + 1).orElse(() => 0)),
      Result.isSuccess(result) ? result.value + 1 : 0,
    ))

  it.prop(
    'the state guards agree with each other and with the stored flags',
    [arbResult],
    ([result]) =>
      Result.isWaiting(result) === result.waiting &&
      Result.isNotInitial(result) === !Result.isInitial(result) &&
      Result.isNotInitial(result) === (Result.isSuccess(result) || Result.isFailure(result)),
  )

  it.prop('getting the value agrees with the available value and throws otherwise', [arbResult], ([result]) => {
    const available = Result.value(result)
    if (Option.isSome(available)) {
      return Equal.equals(Result.getOrElse(result, () => -1), Option.getOrNull(available)) &&
        Equal.equals(Result.getOrThrow(result), Option.getOrNull(available))
    }
    let threw = false
    try {
      Result.getOrThrow(result)
    } catch {
      threw = true
    }
    return Result.getOrElse(result, () => -1) === -1 && threw
  })

  it.prop('failing with an error reports exactly that error', [
    Schema.toArbitrary(Schema.String)(fc),
  ], ([message]) => {
    const failed = Result.fail(message)
    return Result.isFailure(failed) && Equal.equals(Result.error(failed), Option.some(message)) &&
      Option.isNone(Result.value(failed))
  })

  it.prop('failing with a previous result carries forward its remembered success', [arbResult], ([previous]) => {
    const failed = Result.failWithPrevious('boom', { previous: Option.some(previous) })
    const expected = Result.isSuccess(previous)
      ? Option.some(previous)
      : Result.isFailure(previous)
      ? previous.previousSuccess
      : Option.none()
    return Result.isFailure(failed) && failed.waiting === false &&
      Equal.equals(failed.previousSuccess, expected) &&
      Equal.equals(Result.error(failed), Option.some('boom'))
  })

  it.prop('decoding rejects a failure whose cause does not fit the error schema', [
    Schema.toArbitrary(Schema.Number)(fc),
  ], ([code]) => Option.isNone(Schema.decodeUnknownOption(resultSchema)(Result.failure(Cause.fail(code)))))
})
