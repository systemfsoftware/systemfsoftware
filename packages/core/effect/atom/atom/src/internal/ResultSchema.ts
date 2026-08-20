import * as Effect from 'effect/Effect'
import * as Equal from 'effect/Equal'
import * as Option from 'effect/Option'
import { hasProperty } from 'effect/Predicate'
import * as Schema_ from 'effect/Schema'
import * as SchemaIssue from 'effect/SchemaIssue'
import * as SchemaParser from 'effect/SchemaParser'
import * as SchemaTransformation from 'effect/SchemaTransformation'
import { failure, initial, isResult, success } from './ResultValues.js'
import type { Result } from './ResultValues.js'

/**
 * Schema interface for `Result` values, retaining the schemas used for
 * success values and failure errors.
 *
 * @category schemas
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

/**
 * Creates a schema for `Result` values using optional schemas for success values and failure errors.
 *
 * @category schemas
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
  const success_ = options.success ?? Schema_.Never
  const error_ = options.error ?? Schema_.Never
  const schema = Schema_.declareConstructor<
    Result<(A | typeof Schema_.Never)['Type'], (E | typeof Schema_.Never)['Type']>,
    Result<(A | typeof Schema_.Never)['Encoded'], (E | typeof Schema_.Never)['Encoded']>
  >()(
    [success_, Schema_.Cause(error_, Schema_.Defect())],
    ([value, cause]) => (input, ast, options) => {
      if (!isResult(input)) {
        return Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
      }
      if (!hasProperty(input, 'value') && !hasProperty(input, 'cause')) {
        return Effect.succeed(initial(input.waiting))
      }
      if (hasProperty(input, 'cause')) {
        const prevSuccessEffect = input.previousSuccess.pipe(
          Option.map((ps) =>
            Effect.mapBothEager(
              SchemaParser.decodeUnknownEffect(value)(ps.value, options),
              {
                onSuccess: (value) => Option.some(success(value, ps)),
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
          SchemaParser.decodeUnknownEffect(cause)(input.cause, options),
          (issue) => new SchemaIssue.Composite(ast, [new SchemaIssue.Pointer(['cause'], issue)], input, options),
        )
        return Effect.flatMapEager(
          prevSuccessEffect,
          (previousSuccess) =>
            Effect.mapEager(causeEffect, (cause) =>
              failure(cause, {
                previousSuccess,
                waiting: input.waiting,
              })),
        )
      }
      return Effect.mapBothEager(
        SchemaParser.decodeUnknownEffect(value)(input.value, options),
        {
          onSuccess: (value) => success(value, input),
          onFailure: (issue) =>
            new SchemaIssue.Composite(ast, [new SchemaIssue.Pointer(['value'], issue)], input, options),
        },
      )
    },
    {
      expected: 'Result',
      toCodec([value, cause]) {
        const SuccessSchema = Schema_.TaggedStruct('Success', {
          value,
          waiting: Schema_.Boolean,
          timestamp: Schema_.Finite,
        })
        return Schema_.link<
          Result<(A | typeof Schema_.Never)['Encoded'], (E | typeof Schema_.Never)['Encoded']>
        >()(
          Schema_.Union([
            Schema_.TaggedStruct('Initial', { waiting: Schema_.Boolean }),
            SuccessSchema,
            Schema_.TaggedStruct('Failure', {
              cause,
              previousSuccess: Schema_.Option(SuccessSchema),
              waiting: Schema_.Boolean,
            }),
          ]),
          SchemaTransformation.transform({
            decode: (encoded) => {
              if (hasProperty(encoded, 'value')) {
                return success(encoded.value, { waiting: encoded.waiting, timestamp: encoded.timestamp })
              }
              if (hasProperty(encoded, 'cause')) {
                return failure(encoded.cause, {
                  previousSuccess: Option.map(encoded.previousSuccess, (ps) => success(ps.value, ps)),
                  waiting: encoded.waiting,
                })
              }
              return initial(encoded.waiting)
            },
            encode(result) {
              if (hasProperty(result, 'value')) {
                return {
                  _tag: 'Success' as const,
                  value: result.value,
                  waiting: result.waiting,
                  timestamp: result.timestamp,
                }
              }
              if (hasProperty(result, 'cause')) {
                return {
                  _tag: 'Failure' as const,
                  cause: result.cause,
                  previousSuccess: result.previousSuccess,
                  waiting: result.waiting,
                }
              }
              return { _tag: 'Initial' as const, waiting: result.waiting }
            },
          }),
        )
      },
      toEquivalence: Equal.asEquivalence,
      // The wire codec is JSON-based: an `undefined` defect — at any depth —
      // does not survive it. The schema's input space is therefore the
      // wire-representable subset: Fail of the error schema, or Die of a JSON
      // value.
      toArbitrary: () => (fc) => fc.constant(initial(false)),
      toFormatter: ([value, cause]) => (t) => {
        if (hasProperty(t, 'value')) {
          return `Result.Success(${value(t.value)}, ${t.waiting}, ${t.timestamp})`
        }
        if (hasProperty(t, 'cause')) {
          return `Result.Failure(${cause(t.cause)}, ${t.waiting})`
        }
        return `Result.Initial(${t.waiting})`
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
 *
 * @internal
 */
export const schemaCodec = (success: Schema_.Top, error: Schema_.Top): Schema<Schema_.Top, Schema_.Top> =>
  Schema({ success, error })
