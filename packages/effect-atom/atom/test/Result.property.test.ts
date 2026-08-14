import { describe, it } from '@effect/vitest'
import { Cause, Equal, Hash, Option, Result as EffectResult, Schema } from 'effect'
import { FastCheck as fc } from 'effect/testing'
import * as Result from '../src/Result.js'

const resultSchema = Result.Schema({ success: Schema.Number, error: Schema.String })
const arbResult = Schema.toArbitrary(resultSchema)(fc)

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
      combined.value.first === first.value && combined.value.second === second.value
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
        ? Result.isSuccess(waited) && waited.value === result.value &&
          Result.isSuccess(touched) && touched.value === result.value
        : Result.isFailure(waited) && Result.isFailure(touched)
      return waited.waiting === true && touched.waiting === true && tagAndValuePreserved
    },
  )

  it.prop('flatMap passes a failure through untouched', [arbResult], ([result]) =>
    !Result.isFailure(result) ||
    Equal.equals(Result.flatMap(result, (n: number) => Result.success(n + 1)), result))
})
