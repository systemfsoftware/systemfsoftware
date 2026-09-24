import { Atom, Registry, Result } from '@systemfsoftware/effect-atom'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Cause, Effect, Equal, Hash, Layer, Option, Predicate, Result as EffectResult, Schema } from 'effect'
import { expect } from 'vitest'
import { resultSchema, type TaggedError, taggedSchema } from './__fixtures__/Result.schema.js'

type SampleResult = Schema.Schema.Type<typeof resultSchema>
type TaggedSample = Schema.Schema.Type<typeof taggedSchema>

const rememberedSuccess = <A, E>(
  result: Result.Result<A, E>,
): Option.Option<Result.Success<A, E>> => {
  if (Result.isSuccess(result)) {
    return Option.some(result)
  }
  if (Result.isFailure(result)) {
    return result.previousSuccess
  }
  return Option.none()
}

const sameResultTag = (first: SampleResult, second: SampleResult): boolean => {
  if (Result.isInitial(first) && Result.isInitial(second)) {
    return true
  }
  if (Result.isSuccess(first) && Result.isSuccess(second)) {
    return true
  }
  if (Result.isFailure(first) && Result.isFailure(second)) {
    return true
  }
  return false
}

const waitingPreservesTagAndValue = (
  result: SampleResult,
  waited: SampleResult,
  touched: SampleResult,
): boolean => {
  if (Result.isInitial(result)) {
    return Result.isInitial(waited) && Result.isInitial(touched)
  }
  if (Result.isSuccess(result)) {
    return Result.isSuccess(waited) && Equal.equals(waited.value, result.value) &&
      Result.isSuccess(touched) && Equal.equals(touched.value, result.value)
  }
  return Result.isFailure(waited) && Result.isFailure(touched)
}

const exitRoundtripHolds = (result: SampleResult): boolean => {
  const roundtripped = Result.fromExit(Result.toExit(result))
  if (Result.isInitial(result)) {
    return Result.isFailure(roundtripped)
  }
  if (Result.isSuccess(result)) {
    return Equal.equals(roundtripped, Result.success(result.value))
  }
  return Equal.equals(roundtripped, Result.failure(result.cause))
}

const errorOrDefect = <E = unknown>(cause: Cause.Cause<E>): 'error' | 'defect' => {
  if (EffectResult.isSuccess(Cause.findError(cause))) {
    return 'error'
  }
  return 'defect'
}

const matchRouteHolds = (result: SampleResult, routed: string): boolean => {
  if (Result.isInitial(result)) {
    return routed === 'initial'
  }
  if (Result.isSuccess(result)) {
    return routed === 'success'
  }
  return routed === 'failure'
}

const matchWithErrorHolds = (result: SampleResult, routed: string): boolean => {
  if (Result.isInitial(result)) {
    return routed === 'initial'
  }
  if (Result.isSuccess(result)) {
    return routed === 'success'
  }
  return routed === errorOrDefect(result.cause)
}

const matchWithWaitingHolds = (result: SampleResult, routed: string): boolean => {
  if (result.waiting) {
    return routed === 'waiting'
  }
  if (Result.isInitial(result)) {
    return routed === 'waiting'
  }
  if (Result.isSuccess(result)) {
    return routed === 'success'
  }
  return routed === errorOrDefect(result.cause)
}

const flatMapInitialAndSuccessHolds = (result: SampleResult): boolean => {
  if (Result.isInitial(result)) {
    return Equal.equals(Result.flatMap(result, () => Result.success(0)), result)
  }
  if (Result.isSuccess(result)) {
    return Equal.equals(
      Result.flatMap(result, (n: number) => Result.success(n + 1)),
      Result.success(result.value + 1),
    )
  }
  return true
}

const builderFirstHandler = (result: SampleResult): string => {
  if (Result.isInitial(result)) {
    return 'initial'
  }
  if (result.waiting) {
    return 'waiting'
  }
  if (Result.isSuccess(result)) {
    return 'success'
  }
  return 'failure'
}

const isTaggedError = (e: unknown): e is TaggedError => Predicate.hasProperty(e, 'code')

const taggedErrorCode = (result: TaggedSample): number => {
  if (!Result.isFailure(result)) {
    return -1
  }
  return Option.getOrElse(
    Option.map(
      Option.filter(Cause.findErrorOption(result.cause), isTaggedError),
      (e) => e.code,
    ),
    () => -1,
  )
}

const Feature = makeFeature({ it })

Feature('Keeping the last good answer on screen when a retry fails')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A page keeps showing the previous answer after a refresh fails',
      Gherkin.Do.pipe(
        Given('a calculation that succeeds the first time and fails on every retry')('ctx', () =>
          Effect.sync(() => {
            let attempt = 0
            const atom = Atom.make(Effect.suspend(() => {
              attempt++
              if (attempt === 1) {
                return Effect.succeed(10)
              }
              return Effect.fail('server unavailable' as const)
            }))
            const page = Registry.make()
            return { page, atom }
          })),
        When('the value is read, the page is refreshed, and the value is read again')(
          'reading',
          (s) =>
            Effect.sync(() => {
              s.ctx.page.get(s.ctx.atom)
              s.ctx.page.refresh(s.ctx.atom)
              return s.ctx.page.get(s.ctx.atom)
            }),
        ),
        Then('the refresh reports a failure, but the previous answer is still remembered')((s) => {
          expect(Result.isFailure(s.reading)).toBe(true)
          expect(Result.isFailure(s.reading) && Option.isSome(s.reading.previousSuccess)).toBe(true)
        }),
      ),
    )

    scenario(
      'A calculation that has never succeeded has no previous answer to fall back on',
      Gherkin.Do.pipe(
        Given('a calculation that always fails')('ctx', () =>
          Effect.sync(() => {
            const atom = Atom.make(Effect.fail('server unavailable' as const))
            const page = Registry.make()
            return { page, atom }
          })),
        When('the value is read for the first time')('reading', (s) => Effect.sync(() => s.ctx.page.get(s.ctx.atom))),
        Then('the failure carries no previous answer')((s) => {
          expect(Result.isFailure(s.reading) && Option.isNone(s.reading.previousSuccess)).toBe(true)
        }),
      ),
    )

    scenario(
      'A sampled result survives an encode-decode roundtrip',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) => {
                const enc = Option.getOrThrow(Schema.encodeOption(resultSchema)(result))
                const dec = Option.getOrThrow(Schema.decodeOption(resultSchema)(enc))
                return Equal.equals(dec, result)
              })
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'Mapping a sampled result with the identity leaves it unchanged',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) => Effect.sync(() => s.samples.every((result) => Equal.equals(Result.map(result, (n) => n), result))),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'Mapping twice composes exactly like a direct call',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                Equal.equals(
                  Result.map(Result.map(result, (n: number) => n + 1), (n) => n * 2),
                  Result.map(result, (n: number) => (n + 1) * 2),
                )
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'Two way-equal results hash identically',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                (() => {
                  const rebuilt = Result.match(result, {
                    onInitial: (t) => Result.initial(t.waiting),
                    onFailure: (t) =>
                      Result.failure(t.cause, { previousSuccess: t.previousSuccess, waiting: t.waiting }),
                    onSuccess: (t) => Result.successWith(t.value, { waiting: t.waiting, timestamp: t.timestamp }),
                  })
                  return !Equal.equals(result, rebuilt) || Hash.hash(result) === Hash.hash(rebuilt)
                })()
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'A list combines to success exactly when every entry succeeded',
      Gherkin.Do.pipe(
        Given('a batch of generated inputs')('samples', () => Effect.sync(() => PAIR_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every(([first, second]) =>
                Result.isSuccess(Result.all([first, second])) === (Result.isSuccess(first) && Result.isSuccess(second))
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'ReplacePrevious swaps the remembered success of a failure',
      Gherkin.Do.pipe(
        Given('a batch of generated inputs')('samples', () => Effect.sync(() => PAIR_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every(([first, second]) => {
                const replaced = Result.replacePrevious(first, Option.some(second))
                const expected = rememberedSuccess(second)
                if (Result.isFailure(first)) {
                  return Result.isFailure(replaced) && Equal.equals(replaced.previousSuccess, expected)
                }
                return Equal.equals(replaced, first)
              })
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'A non-result shape is rejected by the result schema',
      Gherkin.Do.pipe(
        Given('a batch of generated inputs')('samples', () => Effect.sync(() => GARBAGE_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((garbage) => Option.isNone(Schema.decodeUnknownOption(resultSchema)(garbage)))
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'A labeled all keeps the labels of entries that all succeeded',
      Gherkin.Do.pipe(
        Given('a batch of generated inputs')('samples', () => Effect.sync(() => PAIR_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every(([first, second]) =>
                (() => {
                  const combined = Result.all({ first, second })
                  if (!Result.isSuccess(combined)) return !Result.isSuccess(first) || !Result.isSuccess(second)
                  return Result.isSuccess(first) && Result.isSuccess(second) &&
                    Equal.equals(combined.value.first, first.value) && Equal.equals(combined.value.second, second.value)
                })()
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'A failure rebuilt from its exit keeps its previous success',
      Gherkin.Do.pipe(
        Given('a batch of generated inputs')('samples', () => Effect.sync(() => PAIR_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every(([first, second]) => {
                if (!Result.isFailure(first)) {
                  return true
                }
                const rebuilt = Result.fromExitWithPrevious(Result.toExit(first), Option.some(second))
                const expected = rememberedSuccess(second)
                return Result.isFailure(rebuilt) && Equal.equals(rebuilt.previousSuccess, expected)
              })
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'The builder routes a typed error through onError and everything else to the fallback',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) => {
                const routed = Result.builder(result).onError(() => 'typed' as const).orElse(() => 'other' as const)
                const hasTypedError = Result.isFailure(result) &&
                  EffectResult.isSuccess(Cause.findError(result.cause))
                if (hasTypedError) {
                  return routed === 'typed'
                }
                return routed === 'other'
              })
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'Two sampled results with different tags are never equal',
      Gherkin.Do.pipe(
        Given('a batch of generated inputs')('samples', () => Effect.sync(() => PAIR_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every(([first, second]) => sameResultTag(first, second) || !Equal.equals(first, second))
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'Marking a settled result waiting flips only the waiting flag and touching preserves tag and value',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) => {
                const waited = Result.waiting(result)
                const touched = Result.waiting(result, { touch: true })
                return waited.waiting === true && touched.waiting === true &&
                  waitingPreservesTagAndValue(result, waited, touched)
              })
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'flatMap passes an untouched failure through',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                !Result.isFailure(result) ||
                Equal.equals(Result.flatMap(result, (n: number) => Result.success(n + 1)), result)
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'Marking a result waiting makes it unequal to its unmarked original',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) => {
                const equal = Equal.equals(result, Result.waiting(result))
                if (result.waiting) {
                  return equal
                }
                return !equal
              })
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'A bare failure carries no value and reports its error',
      Gherkin.Do.pipe(
        Given('a batch of generated inputs')('samples', () => Effect.sync(() => MSG_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((message) =>
                (() => {
                  const bare = Result.failure(Cause.fail(message))
                  return Option.isNone(Result.value(bare)) && Equal.equals(Result.error(bare), Option.some(message))
                })()
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'An exit roundtrip collapses to the bare value or cause',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) => Effect.sync(() => s.samples.every((result) => exitRoundtripHolds(result))),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'A successful exit supersedes any remembered previous result',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                !Result.isSuccess(result) ||
                Equal.equals(
                  Result.fromExitWithPrevious(Result.toExit(result), Option.some(result)),
                  Result.success(result.value),
                )
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'waitingFrom yields a waiting initial from nothing and reuses a given result',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                (() => {
                  const fromNothing = Result.waitingFrom(Option.none())
                  const fromResult = Result.waitingFrom(Option.some(result))
                  return Result.isInitial(fromNothing) && fromNothing.waiting === true &&
                    Equal.equals(fromResult, Result.waiting(result))
                })()
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'An interrupted failure carries no value or typed error',
      Gherkin.Do.pipe(
        Given('a batch of generated inputs')('samples', () => Effect.sync(() => [interruptedResult])),
        When('the law is checked against every draw')(
          'ok',
          (_s) =>
            Effect.sync(
              () => (Result.isInterrupted(interruptedResult) && Result.isFailure(interruptedResult) &&
                Option.isNone(Result.value(interruptedResult)) && Option.isNone(Result.error(interruptedResult)) &&
                !Result.isInterrupted(Result.failure(Cause.fail('plain')))),
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'Mapping preserves the value a result carries',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                Equal.equals(
                  Result.value(Result.map(result, (n: number) => n + 1)),
                  Option.map(Result.value(result), (n: number) => n + 1),
                )
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'Mapping a failure keeps its cause and maps the remembered success',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                (() => {
                  if (!Result.isFailure(result)) return true
                  const mappedd = Result.map(result, (n: number) => n + 1)
                  return Result.isFailure(mappedd) && mappedd.waiting === result.waiting &&
                    Equal.equals(mappedd.cause, result.cause) &&
                    Equal.equals(
                      mappedd.previousSuccess,
                      Option.map(result.previousSuccess, (s) => Result.successWith(s.value + 1, s)),
                    )
                })()
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'A cause is available exactly for failures',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                Option.isSome(Result.cause(result)) === Result.isFailure(result) &&
                (!Result.isFailure(result) || Equal.equals(Result.cause(result), Option.some(result.cause)))
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'A typed error is reported exactly for failures with a typed cause',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) => {
                const err = Result.error(result)
                const hasTypedCause = Result.isFailure(result) && Option.isSome(Cause.findErrorOption(result.cause))
                if (hasTypedCause) {
                  return Option.isSome(err)
                }
                return Option.isNone(err)
              })
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'Matching dispatches each state to its own handler',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) => {
                const routedd = Result.match(result, {
                  onInitial: () => 'initial',
                  onFailure: () => 'failure',
                  onSuccess: () => 'success',
                })
                return matchRouteHolds(result, routedd)
              })
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'Matching with an error splits failures into typed errors and defects',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) => {
                const routedd = Result.matchWithError(result, {
                  onInitial: () => 'initial',
                  onError: () => 'error',
                  onDefect: () => 'defect',
                  onSuccess: () => 'success',
                })
                return matchWithErrorHolds(result, routedd)
              })
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'Waiting matching routes waiting states before the tag',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) => {
                const routedd = Result.matchWithWaiting(result, {
                  onWaiting: () => 'waiting',
                  onError: () => 'error',
                  onDefect: () => 'defect',
                  onSuccess: () => 'success',
                })
                return matchWithWaitingHolds(result, routedd)
              })
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'flatMap keeps initial results untouched and applies its function to successes',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) => Effect.sync(() => s.samples.every((result) => flatMapInitialAndSuccessHolds(result))),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'flatMap with a failing function drops the remembered success',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                (() => {
                  if (!Result.isFailure(result)) return true
                  const mappedd = Result.flatMap(result, () => Result.failure(Cause.fail('nope')))
                  return Result.isFailure(mappedd) && Option.isNone(mappedd.previousSuccess) &&
                    mappedd.waiting === result.waiting && Equal.equals(mappedd.cause, result.cause)
                })()
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'Combining mixed entries passes plain values through and stops at the first failure',
      Gherkin.Do.pipe(
        Given('a batch of generated inputs')('samples', () => Effect.sync(() => PAIR_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every(([first, second]) => {
                const bothSucceeded = Result.isSuccess(first) && Result.isSuccess(second)
                const list = Result.all([first, 7, second])
                const record = Result.all({ first, marker: 7, second })
                let listOk = !bothSucceeded
                if (Result.isSuccess(list)) {
                  listOk = bothSucceeded && Equal.equals(list.value[0], first.value) &&
                    Equal.equals(list.value[1], 7) && Equal.equals(list.value[2], second.value)
                }
                let recordOk = !bothSucceeded
                if (Result.isSuccess(record)) {
                  recordOk = bothSucceeded && Equal.equals(record.value.first, first.value) &&
                    Equal.equals(record.value.marker, 7) && Equal.equals(record.value.second, second.value)
                }
                return listOk && recordOk
              })
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'The builder fires only the first matching handler',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) => {
                const routedd = Result.builder(result).onInitial(() => 'initial').onWaiting(() => 'waiting')
                  .onSuccess(() => 'success').onFailure(() => 'failure').orElse(() => 'other')
                return routedd === builderFirstHandler(result)
              })
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'The builder treats initial and waiting states as one case',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                (() => {
                  const fired = Result.builder(result).onInitialOrWaiting(() => true).orElse(() => false)
                  return fired === (Result.isInitial(result) || result.waiting)
                })()
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'Tagged error matching fires only when the failure carries that tag',
      Gherkin.Do.pipe(
        Given('a batch of generated inputs')('samples', () => Effect.sync(() => TAGGED_SAMPLES)),
        When('the law is checked against every draw')('ok', (s) =>
          Effect.sync(() =>
            s.samples.every((result) => {
              const byTag = Result.builder(result).onErrorTag('T', (e) => e.code).orElse(() => -1)
              const byTags = Result.builder(result).onErrorTag(['T'], (e) => e.code).orElse(() => -1)
              const expected = taggedErrorCode(result)
              return Equal.equals(byTag, expected) && Equal.equals(byTags, expected)
            })
          )),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'The builder reports defects only for defect failures',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                (Result.builder(result).onDefect(() => true).orElse(() => false)) ===
                  (Result.isFailure(result) && EffectResult.isSuccess(Cause.findDefect(result.cause)))
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'The builder passes the defect itself to its handler',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                (() => {
                  if (!Result.isFailure(result)) {
                    const routed = Result.builder(result).onSuccess(() => 's').orElse(() => 'o')
                    if (Result.isSuccess(result)) {
                      return routed === 's'
                    }
                    return routed === 'o'
                  }
                  const handled = Result.builder(result).onDefect((received) => received).orElse(() => null)
                  if (EffectResult.isSuccess(Cause.findDefect(result.cause))) {
                    return Equal.equals(handled, Cause.squash(result.cause))
                  }
                  return handled === null
                })()
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'An exhaustive builder renders the handled tagged case',
      Gherkin.Do.pipe(
        Given('a batch of generated inputs')('samples', () => Effect.sync(() => [interruptedResult])),
        When('the exhaustive render is inspected')('ok', (_s) =>
          Effect.sync(() =>
            (function() {
              const result = exhaustiveResult
              return (() => {
                const rendered = Result.builder(result).onErrorTag('T', (e) => `missing:${e.code}`).onDefect(() =>
                  'defect'
                ).onInterrupt(() => 'interrupt').exhaustive()
                return rendered === 'missing:7'
              })()
            })()
          )),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'A builder with no matching handlers renders nothing',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) => {
                const value: AnyValue = Result.builder(result).orNull()
                return value === null
              })
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'The builder reports interruptions only for interrupted failures',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.filter((input) => !Result.isInterrupted(input)).every((
                result: Schema.Schema.Type<typeof resultSchema>,
              ) => Result.builder(result).onInterrupt(() => true).orElse(() => false) === false) &&
              Result.builder(interruptedResult).onInterrupt(() => true).orElse(() => false) === true
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'Rendering reports a handled success, nothing for unhandled non-failures, and throws for an unhandled failure',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                (() => {
                  if (Result.isSuccess(result)) {
                    return Equal.equals(
                      Result.builder(result).onSuccess((n: number) => n + 1).render(),
                      result.value + 1,
                    )
                  }
                  if (Result.isInitial(result)) {
                    const rendered: AnyValue = Result.builder(result).render()
                    return rendered === null
                  }
                  let threw = false
                  try {
                    Result.builder(result).render()
                  } catch {
                    threw = true
                  }
                  return threw
                })()
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'A schema without a value schema rejects successes and remembered successes',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                (() => {
                  const noValue = Result.Schema({ error: Schema.String })
                  const encoded = Option.getOrThrow(Schema.encodeOption(resultSchema)(result))
                  const decoded = Schema.decodeUnknownOption(noValue)(encoded)
                  const expectRejected = Result.isSuccess(result) ||
                    (Result.isFailure(result) && Option.isSome(result.previousSuccess))
                  if (expectRejected) {
                    return Option.isNone(decoded)
                  }
                  return Option.isSome(decoded)
                })()
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'The wire codec roundtrips every sampled state',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                (() => {
                  const codex = Schema.toCodecJson(resultSchema)
                  const enc = Option.getOrThrow(Schema.encodeOption(codex)(result))
                  const dec = Option.getOrThrow(Schema.decodeOption(codex)(enc))
                  return Equal.equals(dec, result)
                })()
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'Formatting renders every sampled state to a named string',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                (() => {
                  const formatted = Schema.toFormatter(resultSchema)(result)
                  return typeof formatted === 'string' && formatted.length > 0
                })()
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'A result composes through pipe like a direct call',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                Equal.equals(result.pipe(Result.map((n: number) => n + 1)), Result.map(result, (n: number) => n + 1))
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'A builder composes through pipe',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) => {
                let expected = 0
                if (Result.isSuccess(result)) {
                  expected = result.value + 1
                }
                return Equal.equals(
                  Result.builder(result).pipe((b) => b.onSuccess((n: number) => n + 1).orElse(() => 0)),
                  expected,
                )
              })
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'The state guards agree with each other and the stored flags',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((
                result,
              ) => (Result.isWaiting(result) === result.waiting &&
                Result.isNotInitial(result) === !Result.isInitial(result) &&
                Result.isNotInitial(result) === (Result.isSuccess(result) || Result.isFailure(result)))
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'Getting the value agrees with the available value and throws otherwise',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                (() => {
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
                })()
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'Failing with an error reports exactly that error',
      Gherkin.Do.pipe(
        Given('a batch of generated inputs')('samples', () => Effect.sync(() => MSG_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((
                message,
              ) => (Result.isFailure(Result.fail(message)) &&
                Equal.equals(Result.error(Result.fail(message)), Option.some(message)) &&
                Option.isNone(Result.value(Result.fail(message))))
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'A success built from an empty object keeps the object as its value',
      Gherkin.Do.pipe(
        Given('a success whose value is an empty object')('outcome', () => Effect.sync(() => Result.success({}))),
        When('the outcome is inspected')('reading', (s) => Effect.sync(() => s.outcome)),
        Then('it is a success carrying exactly that object')((s) => {
          expect(Result.isSuccess(s.reading)).toBe(true)
          expect(s.reading.value).toEqual({})
        }),
      ),
    )
    scenario(
      'A failure built from an empty object is a failure carrying that error',
      Gherkin.Do.pipe(
        Given('a failure whose error is an empty object')('outcome', () => Effect.sync(() => Result.fail({}))),
        When('the outcome is inspected')('reading', (s) => Effect.sync(() => s.outcome)),
        Then('it reports a failure whose error is exactly that object')((s) => {
          expect(Result.isFailure(s.reading)).toBe(true)
          expect(Equal.equals(Result.error(s.reading), Option.some({}))).toBe(true)
        }),
      ),
    )
    scenario(
      'Failing with a previous result carries forward its remembered success',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                (() => {
                  const failed = Result.failWithPrevious('boom', { previous: Option.some(result) })
                  const expected = rememberedSuccess(result)
                  return Result.isFailure(failed) && failed.waiting === false &&
                    Equal.equals(failed.previousSuccess, expected) &&
                    Equal.equals(Result.error(failed), Option.some('boom'))
                })()
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
    scenario(
      'A failure whose cause does not fit the error schema is rejected on decode',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((_result) =>
                (() => {
                  const decoded = Schema.decodeUnknownOption(resultSchema)(Result.failure(Cause.fail(7)))
                  return Option.isNone(decoded)
                })()
              )
            ),
        ),
        Then('every draw satisfies the law')((s) => {
          expect(s.ok).toBe(true)
        }),
      ),
    )
  })
const RESULT_SAMPLES: readonly Schema.Schema.Type<typeof resultSchema>[] = [
  Result.initial(false),
  Result.initial(true),
  Result.success(1),
  Result.successWith(2, { timestamp: 0 }),
  Result.successWith(3, { waiting: true }),
  Result.failure(Cause.fail('x')),
  Result.failure(Cause.fail('x'), { previousSuccess: Option.some(Result.success(1)), waiting: true }),
  Result.failure(Cause.die('boom')),
  Result.failure(Cause.interrupt(1)),
]
const PAIR_SAMPLES:
  readonly (readonly [Schema.Schema.Type<typeof resultSchema>, Schema.Schema.Type<typeof resultSchema>])[] =
    RESULT_SAMPLES.flatMap((a) => RESULT_SAMPLES.map((b) => [a, b] as const))
const MSG_SAMPLES = ['oops', 'boom', ''] as const
type AnyValue<A = unknown> = A
const GARBAGE_SAMPLES: readonly AnyValue[] = [null, 5, 'x', { a: 1 }, { _tag: 'Weird' }, []]
const TAGGED_SAMPLES: readonly Schema.Schema.Type<typeof taggedSchema>[] = [
  Result.success(2),
  Result.failure(Cause.fail<TaggedError>({ _tag: 'T', code: 7 })),
  Result.failure(Cause.fail('plain')),
]
const interruptedResult = Result.failure<never, never>(Cause.interrupt(1))
const exhaustiveResult = Result.fail<TaggedError>({ _tag: 'T', code: 7 })
