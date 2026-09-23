import * as Effect from 'effect/Effect'
import * as Equal from 'effect/Equal'
import { dual } from 'effect/Function'
import * as Option from 'effect/Option'
import { hasProperty } from 'effect/Predicate'
import * as Schema_ from 'effect/Schema'
import * as SchemaGetter from 'effect/SchemaGetter'
import * as SchemaIssue from 'effect/SchemaIssue'
import * as SchemaParser from 'effect/SchemaParser'
import * as SchemaTransformation from 'effect/SchemaTransformation'
import { failure, initial, isResult, successWith } from './ResultValues.js'
import type { Failure, Result, Success } from './ResultValues.js'

type AnyFailure<A = unknown, E = unknown> = Failure<A, E>
type AnyResult<A = unknown, E = unknown> = Result<A, E>

/**
 * Schema interface for `Result` values, retaining the schemas used for
 * success values and failure errors.
 *
 * @since 4.0.0
 */
export interface Schema<
  Success extends Schema_.Constraint,
  Error extends Schema_.Constraint,
> extends
  Schema_.declareConstructor<
    Result<(Success | typeof Schema_.Never)['Type'], (Error | typeof Schema_.Never)['Type']>,
    Result<(Success | typeof Schema_.Never)['Encoded'], (Error | typeof Schema_.Never)['Encoded']>,
    readonly [Success | typeof Schema_.Never, Schema_.Cause<Error | typeof Schema_.Never, Schema_.Defect>]
  >
{
  readonly success: Success | typeof Schema_.Never
  readonly error: Error | typeof Schema_.Never
}

const schemaOrNever = <A extends Schema_.Constraint>(
  schema: A | undefined,
): A | typeof Schema_.Never => {
  if (schema === undefined) {
    return Schema_.Never
  }
  return schema
}

const isSuccessResult = <A, E>(result: Result<A, E>): result is Success<A, E> => hasProperty(result, 'value')

const isFailureResult = <A, E>(result: Result<A, E>): result is Failure<A, E> => hasProperty(result, 'cause')

/**
 * Creates a schema for `Result` values using optional schemas for success values and failure errors.
 *
 * @since 4.0.0
 */
export const Schema = <
  A extends Schema_.Constraint = typeof Schema_.Never,
  E extends Schema_.Constraint = typeof Schema_.Never,
>(
  options: {
    readonly success?: A | undefined
    readonly error?: E | undefined
  },
): Schema<A, E> => {
  const success_ = schemaOrNever(options.success)
  const error_ = schemaOrNever(options.error)
  const schema = Schema_.declareConstructor<
    Result<(A | typeof Schema_.Never)['Type'], (E | typeof Schema_.Never)['Type']>,
    Result<(A | typeof Schema_.Never)['Encoded'], (E | typeof Schema_.Never)['Encoded']>
  >()(
    [success_, Schema_.Cause(error_, Schema_.Defect())],
    ([value, cause]) => (input, ast, options) => {
      const parseFailureKnown = (failed: AnyFailure) => {
        const prevSuccessEffect = failed.previousSuccess.pipe(
          Option.map((ps) =>
            Effect.mapBothEager(
              SchemaParser.decodeUnknownEffect(value)(ps.value, options),
              {
                onSuccess: (value) => Option.some(successWith(value, ps)),
                onFailure: (issue) =>
                  new SchemaIssue.Composite(
                    ast,
                    [
                      new SchemaIssue.Pointer(['previousSuccess', 'value'], issue),
                    ],
                    input,
                    options,
                  ),
              },
            )
          ),
          Option.getOrElse(() => Effect.succeedNone),
        )
        const causeEffect = Effect.mapErrorEager(
          SchemaParser.decodeUnknownEffect(cause)(failed.cause, options),
          (issue) => new SchemaIssue.Composite(ast, [new SchemaIssue.Pointer(['cause'], issue)], input, options),
        )
        return Effect.flatMapEager(
          prevSuccessEffect,
          (previousSuccess) =>
            Effect.mapEager(causeEffect, (cause) =>
              failure(cause, {
                previousSuccess,
                waiting: failed.waiting,
              })),
        )
      }

      const parseSuccessOrInitial = (known: AnyResult) => {
        if (isSuccessResult(known)) {
          return Effect.mapBothEager(
            SchemaParser.decodeUnknownEffect(value)(known.value, options),
            {
              onSuccess: (value) => successWith(value, known),
              onFailure: (issue) =>
                new SchemaIssue.Composite(ast, [new SchemaIssue.Pointer(['value'], issue)], input, options),
            },
          )
        }
        return Effect.succeed(initial(known.waiting))
      }

      const parseKnown = (known: AnyResult) => {
        if (isFailureResult(known)) {
          return parseFailureKnown(known)
        }
        return parseSuccessOrInitial(known)
      }

      if (!isResult(input)) {
        return Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
      }
      return parseKnown(input)
    },
    {
      expected: 'Result',
      toCodec([value, cause]) {
        const SuccessSchema = Schema_.TaggedStruct('Success', {
          value,
          waiting: Schema_.Boolean,
          timestamp: Schema_.Finite,
        })
        const encodedSchema = Schema_.Union([
          Schema_.TaggedStruct('Initial', { waiting: Schema_.Boolean }),
          SuccessSchema,
          Schema_.TaggedStruct('Failure', {
            cause,
            previousSuccess: Schema_.Option(SuccessSchema),
            waiting: Schema_.Boolean,
          }),
        ])
        return Schema_.link<
          Result<(A | typeof Schema_.Never)['Encoded'], (E | typeof Schema_.Never)['Encoded']>
        >()(
          encodedSchema,
          SchemaTransformation.transform({
            decode: (encoded) => {
              function decodeRest(rest: typeof encoded) {
                if (hasProperty(rest, 'cause')) {
                  return failure(rest.cause, {
                    previousSuccess: Option.map(rest.previousSuccess, (ps) => successWith(ps.value, ps)),
                    waiting: rest.waiting,
                  })
                }
                return initial<(A | typeof Schema_.Never)['Encoded'], (E | typeof Schema_.Never)['Encoded']>(
                  rest.waiting,
                )
              }
              if (hasProperty(encoded, 'value')) {
                return successWith(encoded.value, { waiting: encoded.waiting, timestamp: encoded.timestamp })
              }
              return decodeRest(encoded)
            },
            encode(result): (typeof encodedSchema)['Type'] {
              function encodeRest(rest: typeof result): (typeof encodedSchema)['Type'] {
                if (hasProperty(rest, 'cause')) {
                  return {
                    _tag: 'Failure',
                    cause: rest.cause,
                    previousSuccess: rest.previousSuccess,
                    waiting: rest.waiting,
                  }
                }
                return { _tag: 'Initial', waiting: rest.waiting }
              }
              if (hasProperty(result, 'value')) {
                return {
                  _tag: 'Success',
                  value: result.value,
                  waiting: result.waiting,
                  timestamp: result.timestamp,
                }
              }
              return encodeRest(result)
            },
          }),
        )
      },
      toEquivalence: Equal.asEquivalence,
      // Native arbitrary compiles Declaration via toCodecArbitrary. The previous
      // `toArbitrary` constructed `Initial`; keep that constructor, now as a
      // Schema link, until Cause/Defect generation is a real encoded subset.
      toCodecArbitrary: () =>
        Schema_.link<
          Result<(A | typeof Schema_.Never)['Type'], (E | typeof Schema_.Never)['Type']>
        >()(
          Schema_.TaggedStruct('Initial', { waiting: Schema_.Boolean }),
          {
            decode: SchemaGetter.transform((encoded) =>
              initial<(A | typeof Schema_.Never)['Type'], (E | typeof Schema_.Never)['Type']>(
                encoded.waiting,
              )
            ),
            encode: SchemaGetter.transform((result) => ({
              _tag: 'Initial' as const,
              waiting: result.waiting,
            })),
          },
        ),
      toFormatter: ([value, cause]) => (t) => {
        function formatRest(rest: typeof t) {
          if (hasProperty(rest, 'cause')) {
            return `Result.Failure(${cause(rest.cause)}, ${rest.waiting})`
          }
          return `Result.Initial(${rest.waiting})`
        }
        if (hasProperty(t, 'value')) {
          return `Result.Success(${value(t.value)}, ${t.waiting}, ${t.timestamp})`
        }
        return formatRest(t)
      },
    },
  )
  return Object.assign(schema, {
    success: success_,
    error: error_,
  })
}

/**
 * A codec for `Result` values built from the given success and error schemas.
 */

export const schemaCodec: {
  (error: Schema_.Top): (success: Schema_.Top) => Schema<Schema_.Top, Schema_.Top>
  (success: Schema_.Top, error: Schema_.Top): Schema<Schema_.Top, Schema_.Top>
} = dual(
  2,
  (success: Schema_.Top, error: Schema_.Top): Schema<Schema_.Top, Schema_.Top> => Schema({ success, error }),
)
