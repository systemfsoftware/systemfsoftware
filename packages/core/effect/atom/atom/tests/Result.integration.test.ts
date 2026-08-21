import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Cause, Effect, Equal, Hash, Option, Predicate, Result as EffectResult, Schema } from 'effect'
import { expect } from 'vitest'
import { Atom, Registry, Result } from '../src/index.js'
import { resultSchema, type TaggedError, taggedSchema } from './__fixtures__/Result.schema.js'

const Feature = makeFeature({ it, layer })

Feature('Keeping the last good answer on screen when a retry fails')
  .body(({ scenario }) => {
    scenario(
      'A page keeps showing the previous answer after a refresh fails',
      Gherkin.Do.pipe(
        Given('a calculation that succeeds the first time and fails on every retry')('ctx', () =>
          Effect.sync(() => {
            let attempt = 0
            const atom = Atom.make(Effect.suspend(() => {
              attempt++
              return attempt === 1 ? Effect.succeed(10) : Effect.fail('server unavailable' as const)
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
              s.samples.every((result) =>
                Equal.equals(Schema.decodeSync(resultSchema)(Schema.encodeSync(resultSchema)(result)), result)
              )
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
                    onSuccess: (t) => Result.success(t.value, { waiting: t.waiting, timestamp: t.timestamp }),
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
              s.samples.every(([first, second]) =>
                (() => {
                  const replaced = Result.replacePrevious(first, Option.some(second))
                  const expected = Result.isSuccess(second)
                    ? Option.some(second)
                    : Result.isFailure(second)
                    ? second.previousSuccess
                    : Option.none()
                  return Result.isFailure(first)
                    ? (Result.isFailure(replaced) && Equal.equals(replaced.previousSuccess, expected))
                    : Equal.equals(replaced, first)
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
              s.samples.every(([first, second]) =>
                !Result.isFailure(first) || (() => {
                  const rebuilt = Result.fromExitWithPrevious(Result.toExit(first), Option.some(second))
                  const expected = Result.isSuccess(second)
                    ? Option.some(second)
                    : Result.isFailure(second)
                    ? second.previousSuccess
                    : Option.none()
                  return Result.isFailure(rebuilt) && Equal.equals(rebuilt.previousSuccess, expected)
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
      'The builder routes a typed error through onError and everything else to the fallback',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                (() => {
                  const routed = Result.builder(result).onError(() => 'typed' as const).orElse(() => 'other' as const)
                  const hasTypedError = Result.isFailure(result) &&
                    EffectResult.isSuccess(Cause.findError(result.cause))
                  return routed === (hasTypedError ? 'typed' : 'other')
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
      'Two sampled results with different tags are never equal',
      Gherkin.Do.pipe(
        Given('a batch of generated inputs')('samples', () => Effect.sync(() => PAIR_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every(([first, second]) => first['_tag'] === second['_tag'] || !Equal.equals(first, second))
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
              s.samples.every((result) =>
                (() => {
                  const waited = Result.waiting(result)
                  const touched = Result.waiting(result, { touch: true })
                  const tagAndValuePreserved = Result.isInitial(result)
                    ? (Result.isInitial(waited) && Result.isInitial(touched))
                    : Result.isSuccess(result)
                    ? (Result.isSuccess(waited) && Equal.equals(waited.value, result.value) &&
                      Result.isSuccess(touched) && Equal.equals(touched.value, result.value))
                    : (Result.isFailure(waited) && Result.isFailure(touched))
                  return waited.waiting === true && touched.waiting === true && tagAndValuePreserved
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
              s.samples.every((result) =>
                result.waiting
                  ? Equal.equals(result, Result.waiting(result))
                  : !Equal.equals(result, Result.waiting(result))
              )
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
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                Result.isInitial(result)
                  ? Result.isFailure(Result.fromExit(Result.toExit(result)))
                  : Result.isSuccess(result)
                  ? Equal.equals(Result.fromExit(Result.toExit(result)), Result.success(result.value))
                  : Equal.equals(Result.fromExit(Result.toExit(result)), Result.failure(result.cause))
              )
            ),
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
                      Option.map(result.previousSuccess, (s) => Result.success(s.value + 1, s)),
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
              s.samples.every((result) =>
                (() => {
                  const err = Result.error(result)
                  const hasTypedCause = Result.isFailure(result) && Option.isSome(Cause.findErrorOption(result.cause))
                  return hasTypedCause ? Option.isSome(err) : Option.isNone(err)
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
      'Matching dispatches each state to its own handler',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                (() => {
                  const routedd = Result.match(result, {
                    onInitial: () => 'initial',
                    onFailure: () => 'failure',
                    onSuccess: () => 'success',
                  })
                  return Result.isInitial(result)
                    ? routedd === 'initial'
                    : Result.isSuccess(result)
                    ? routedd === 'success'
                    : routedd === 'failure'
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
      'Matching with an error splits failures into typed errors and defects',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                (() => {
                  const routedd = Result.matchWithError(result, {
                    onInitial: () => 'initial',
                    onError: () => 'error',
                    onDefect: () => 'defect',
                    onSuccess: () => 'success',
                  })
                  if (Result.isInitial(result)) return routedd === 'initial'
                  if (Result.isSuccess(result)) return routedd === 'success'
                  return routedd === (EffectResult.isSuccess(Cause.findError(result.cause)) ? 'error' : 'defect')
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
      'Waiting matching routes waiting states before the tag',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                (() => {
                  const routedd = Result.matchWithWaiting(result, {
                    onWaiting: () => 'waiting',
                    onError: () => 'error',
                    onDefect: () => 'defect',
                    onSuccess: () => 'success',
                  })
                  if (result.waiting) return routedd === 'waiting'
                  if (Result.isInitial(result)) return routedd === 'waiting'
                  if (Result.isSuccess(result)) return routedd === 'success'
                  return routedd === (EffectResult.isSuccess(Cause.findError(result.cause)) ? 'error' : 'defect')
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
      'flatMap keeps initial results untouched and applies its function to successes',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                Result.isInitial(result)
                  ? Equal.equals(Result.flatMap(result, () => Result.success(0)), result)
                  : Result.isSuccess(result)
                  ? Equal.equals(
                    Result.flatMap(result, (n: number) => Result.success(n + 1)),
                    Result.success(result.value + 1),
                  )
                  : true
              )
            ),
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
              s.samples.every(([first, second]) =>
                (() => {
                  const bothSucceeded = Result.isSuccess(first) && Result.isSuccess(second)
                  const list = Result.all([first, 7, second])
                  const record = Result.all({ first, marker: 7, second })
                  const listOk = Result.isSuccess(list)
                    ? (bothSucceeded && Equal.equals(list.value[0], first.value) && Equal.equals(list.value[1], 7) &&
                      Equal.equals(list.value[2], second.value))
                    : !bothSucceeded
                  const recordOk = Result.isSuccess(record)
                    ? (bothSucceeded && Equal.equals(record.value.first, first.value) &&
                      Equal.equals(record.value.marker, 7) && Equal.equals(record.value.second, second.value))
                    : !bothSucceeded
                  return listOk && recordOk
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
      'The builder fires only the first matching handler',
      Gherkin.Do.pipe(
        Given('every representative result')('samples', () => Effect.sync(() => RESULT_SAMPLES)),
        When('the law is checked against every draw')(
          'ok',
          (s) =>
            Effect.sync(() =>
              s.samples.every((result) =>
                (() => {
                  const routedd = Result.builder(result).onInitial(() => 'initial').onWaiting(() => 'waiting')
                    .onSuccess(() => 'success').onFailure(() => 'failure').orElse(() => 'other')
                  const expected = Result.isInitial(result)
                    ? 'initial'
                    : result.waiting
                    ? 'waiting'
                    : Result.isSuccess(result)
                    ? 'success'
                    : 'failure'
                  return routedd === expected
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
              const expected = Result.isFailure(result)
                ? Option.getOrElse(
                  Option.map(
                    Option.filter(
                      Cause.findErrorOption(result.cause),
                      (e): e is TaggedError => Predicate.hasProperty(e, '_tag') && e['_tag'] === 'T',
                    ),
                    (e) => e.code,
                  ),
                  () => -1,
                )
                : -1
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
                    return Result.builder(result).onSuccess(() => 's').orElse(() => 'o') ===
                      (Result.isSuccess(result) ? 's' : 'o')
                  }
                  const handled = Result.builder(result).onDefect((received) => received).orElse(() => null)
                  return EffectResult.isSuccess(Cause.findDefect(result.cause))
                    ? Equal.equals(handled, Cause.squash(result.cause))
                    : handled === null
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
          (s) => Effect.sync(() => s.samples.every((result) => Result.builder(result).orNull() === null)),
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
                  if (Result.isInitial(result)) return Result.builder(result).render() === null
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
                  const decoded = Schema.decodeUnknownOption(noValue)(Schema.encodeSync(resultSchema)(result))
                  const expectRejected = Result.isSuccess(result) ||
                    (Result.isFailure(result) && Option.isSome(result.previousSuccess))
                  return expectRejected ? Option.isNone(decoded) : Option.isSome(decoded)
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
                  return Equal.equals(Schema.decodeSync(codex)(Schema.encodeSync(codex)(result)), result)
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
              s.samples.every((result) =>
                Equal.equals(
                  Result.builder(result).pipe((b) => b.onSuccess((n: number) => n + 1).orElse(() => 0)),
                  Result.isSuccess(result) ? result.value + 1 : 0,
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
                  const expected = Result.isSuccess(result)
                    ? Option.some(result)
                    : Result.isFailure(result)
                    ? result.previousSuccess
                    : Option.none()
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
  Result.success(2, { timestamp: 0 }),
  Result.success(3, { waiting: true }),
  Result.failure(Cause.fail('x')),
  Result.failure(Cause.fail('x'), { previousSuccess: Option.some(Result.success(1)), waiting: true }),
  Result.failure(Cause.die('boom')),
  Result.failure(Cause.interrupt(1)),
]
const PAIR_SAMPLES:
  readonly (readonly [Schema.Schema.Type<typeof resultSchema>, Schema.Schema.Type<typeof resultSchema>])[] =
    RESULT_SAMPLES.flatMap((a) => RESULT_SAMPLES.map((b) => [a, b] as const))
const MSG_SAMPLES = ['oops', 'boom', ''] as const
const GARBAGE_SAMPLES: readonly unknown[] = [null, 5, 'x', { a: 1 }, { _tag: 'Weird' }, []]
const TAGGED_SAMPLES: readonly Schema.Schema.Type<typeof taggedSchema>[] = [
  Result.success(2),
  Result.failure(Cause.fail({ _tag: 'T', code: 7 })),
  Result.failure(Cause.fail('plain')),
]
const interruptedResult = Result.failure<unknown, never>(Cause.interrupt(1))
const exhaustiveResult = Result.fail<TaggedError>({ _tag: 'T', code: 7 })
