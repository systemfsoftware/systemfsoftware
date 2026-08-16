import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Equal from 'effect/Equal'
import * as Option from 'effect/Option'
import * as Schema_ from 'effect/Schema'
import * as SchemaIssue from 'effect/SchemaIssue'
import * as SchemaParser from 'effect/SchemaParser'
import * as SchemaTransformation from 'effect/SchemaTransformation'
import { failure, initial, isResult, success } from './result-values.js'
import type { Result } from './result-values.js'

/**
 * Schema interface for `Result` values, retaining the schemas used for success values and failure errors.
 *
 * @category schemas
 * @since 4.0.0
 */
export interface Schema<
  Success extends Schema_.Constraint,
  Error extends Schema_.Constraint,
> extends
  Schema_.declareConstructor<
    Result<Success['Type'], Error['Type']>,
    Result<Success['Encoded'], Error['Encoded']>,
    readonly [Success, Schema_.Cause<Error, Schema_.Defect>]
  >
{
  readonly success: Success
  readonly error: Error
}

/**
 * Creates a schema for `Result` values using optional schemas for success values and failure errors.
 *
 * @category schemas
 * @since 4.0.0
 */
export const Schema = <
  A extends Schema_.Constraint = Schema_.Never,
  E extends Schema_.Constraint = Schema_.Never,
>(
  options: {
    readonly success?: A | undefined
    readonly error?: E | undefined
  },
): Schema<A, E> => {
  const success_ = options.success ?? Schema_.Never
  const error = options.error ?? Schema_.Never
  const schema = Schema_.declareConstructor<
    Result<A['Type'], E['Type']>,
    Result<A['Encoded'], E['Encoded']>
  >()(
    [success_ as A, Schema_.Cause(error as E, Schema_.Defect())],
    ([value, cause]) => (input, ast, options) => {
      if (!isResult(input)) {
        return Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
      }
      switch (input._tag) {
        case 'Initial':
          return Effect.succeed(input)
        case 'Success':
          return Effect.mapBothEager(
            SchemaParser.decodeUnknownEffect(value)(input.value, options),
            {
              onSuccess: (value) => success(value, input),
              onFailure: (issue) =>
                new SchemaIssue.Composite(ast, [new SchemaIssue.Pointer(['value'], issue)], input, options),
            },
          )
        case 'Failure': {
          const prevSuccessEffect = input.previousSuccess.pipe(
            Option.map((ps) =>
              Effect.mapBothEager(
                SchemaParser.decodeUnknownEffect(value)(ps.value, options),
                {
                  onSuccess: (value) => Option.some(success<A['Type'], E['Type']>(value, ps)),
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
      }
    },
    {
      expected: 'Result',
      toCodec([value, cause]) {
        const Success = Schema_.TaggedStruct('Success', { value, waiting: Schema_.Boolean, timestamp: Schema_.Number })
        return Schema_.link<Result<A['Encoded'], E['Encoded']>>()(
          Schema_.Union([
            Schema_.TaggedStruct('Initial', { waiting: Schema_.Boolean }),
            Success,
            Schema_.TaggedStruct('Failure', {
              cause,
              previousSuccess: Schema_.Option(Success),
              waiting: Schema_.Boolean,
            }),
          ]),
          SchemaTransformation.transform({
            decode: (encoded): Result<A['Encoded'], E['Encoded']> => {
              switch (encoded._tag) {
                case 'Initial':
                  return initial(encoded.waiting)
                case 'Success':
                  return success(encoded.value, {
                    waiting: encoded.waiting,
                    timestamp: encoded.timestamp,
                  })
                case 'Failure': {
                  return failure(encoded.cause, {
                    previousSuccess: Option.map(encoded.previousSuccess, (ps) => success(ps.value, ps)),
                    waiting: encoded.waiting,
                  })
                }
              }
            },
            encode(result) {
              switch (result._tag) {
                case 'Initial':
                  return { _tag: 'Initial' as const, waiting: result.waiting }
                case 'Success':
                  return {
                    _tag: 'Success' as const,
                    value: result.value,
                    waiting: result.waiting,
                    timestamp: result.timestamp,
                  }
                case 'Failure':
                  return {
                    _tag: 'Failure' as const,
                    cause: result.cause,
                    previousSuccess: result.previousSuccess,
                    waiting: result.waiting,
                  }
              }
            },
          }),
        )
      },
      toEquivalence: Equal.asEquivalence,
      // The wire codec is JSON-based: an `undefined` defect — at any depth —
      // does not survive it. The schema's input space is therefore the
      // wire-representable subset: Fail of the error schema, or Die of a JSON
      // value.
      toArbitrary: ([value]) => (fc) =>
        fc.oneof(
          fc.record({
            value: value.arbitrary,
            waiting: fc.boolean(),
            timestamp: fc.nat(),
          }).map((r) => success(r.value, { waiting: r.waiting, timestamp: r.timestamp })),
          fc.record({
            cause: fc.oneof(
              Schema_.toArbitrary(error)(fc).map((e) => Cause.fail(e)),
              fc.jsonValue().map((d) => Cause.die(d)),
            ),
            waiting: fc.boolean(),
            previous: fc.option(value.arbitrary, { nil: undefined }),
          }).map((r) =>
            failure(r.cause, {
              previousSuccess: r.previous === undefined ? Option.none() : Option.some(success(r.previous)),
              waiting: r.waiting,
            })
          ),
          fc.boolean().map((waiting) => initial(waiting)),
        ),
      toFormatter: ([value, cause]) => (t) => {
        switch (t._tag) {
          case 'Success':
            return `Result.Success(${value(t.value)}, ${t.waiting}, ${t.timestamp})`
          case 'Failure':
            return `Result.Failure(${cause(t.cause)}, ${t.waiting})`
          case 'Initial':
            return `Result.Initial(${t.waiting})`
        }
      },
    },
  )
  return Object.assign(schema, {
    success: success_ as A,
    error: error as E,
  })
}

/**
 * A `Schema.ConstraintCodec` for `Result<unknown, unknown>` built from the
 * given success and error schemas.
 *
 * @internal
 */
export const schemaCodec = (
  success: Schema_.Top,
  error: Schema_.Top,
): Schema_.ConstraintCodec<Result<unknown, unknown>, unknown> =>
  Schema({ success, error }) as Schema_.ConstraintCodec<
    Result<unknown, unknown>,
    unknown,
    any,
    any
  > as Schema_.ConstraintCodec<Result<unknown, unknown>, unknown>
