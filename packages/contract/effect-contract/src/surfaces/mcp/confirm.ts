import { Boolean as Bool, Clock, Effect, Match, Option, Result, Schema } from 'effect'
import { McpSchema, McpServer } from 'effect/ai'
import { Contract } from '../../mod.js'
import {
  argumentDigest,
  confirmationExpiry,
  McpConfirmationKey,
  signRequestState,
  verifyRequestState,
} from './confirmation-state.js'
import type { ConfirmationClaims } from './confirmation-state.schema.js'

export const WRITE_CONFIRMATION_KEY = 'confirm'

const MODERN_PROTOCOL = '2026-07-28'

export interface ConfirmRequest<R> {
  readonly tool: string
  readonly risk: string
  readonly invocation: Contract.Invocation
  readonly run: Effect.Effect<McpSchema.CallToolResult, McpSchema.InternalError, R>
}

interface ConfirmationTarget {
  readonly tool: string
  readonly risk: string
}

const confirmationMessage = (request: ConfirmationTarget): string =>
  `Confirm the ${request.risk} write to ${request.tool}.`

const toolError = (text: string): McpSchema.CallToolResult =>
  new McpSchema.CallToolResult({ content: [{ type: 'text', text }], isError: true })

export const ConfirmationDeclined = toolError('ConfirmationDeclined: the client declined the write.')

export const ConfirmationUnavailable = toolError('ConfirmationUnavailable: this client cannot confirm a write.')

const subjectOf = (principal: Contract.Principal): string =>
  Match.value(principal).pipe(
    Match.tag('Person', (person) => person.subject),
    Match.orElse(() => ''),
  )

const inputRequiredOf = (request: ConfirmationTarget, requestState: string): McpSchema.InputRequired =>
  new McpSchema.InputRequired({
    inputRequests: {
      [WRITE_CONFIRMATION_KEY]: {
        method: 'elicitation/create',
        params: {
          mode: 'form',
          message: confirmationMessage(request),
          requestedSchema: {
            type: 'object',
            properties: { approve: { type: 'boolean' } },
            required: ['approve'],
          },
        },
      },
    },
    requestState,
  })

const declinedOrRun = <R>(
  request: ConfirmRequest<R>,
  approved: boolean,
): Effect.Effect<McpSchema.CallToolResult, McpSchema.InternalError, R> =>
  approved ? request.run : Effect.succeed(ConfirmationDeclined)

const approvalOf = <R>(
  request: ConfirmRequest<R>,
  context: McpSchema.McpRequestContext['Service'],
): Effect.Effect<McpSchema.CallToolResult, McpSchema.InternalError, R> =>
  Option.match(Option.fromUndefinedOr(context.inputResponses?.[WRITE_CONFIRMATION_KEY]), {
    onNone: () => Effect.succeed(ConfirmationDeclined),
    onSome: (response) =>
      Option.match(
        Schema.decodeUnknownOption(Schema.Struct({
          action: Schema.Literals(['accept', 'decline', 'cancel']),
          content: Schema.optional(Schema.Struct({ approve: Schema.optional(Schema.Boolean) })),
        }))(response),
        {
          onNone: () => Effect.succeed(ConfirmationDeclined),
          onSome: (decoded) =>
            declinedOrRun(
              request,
              Bool.every([decoded.action === 'accept', decoded.content?.approve === true]),
            ),
        },
      ),
  })

const retryOf = <R>(
  request: ConfirmRequest<R>,
  context: McpSchema.McpRequestContext['Service'],
  requestState: string,
  expected: ConfirmationClaims,
): Effect.Effect<
  McpSchema.CallToolResult,
  McpSchema.InternalError | McpSchema.InvalidParams,
  R | McpConfirmationKey
> =>
  Effect.gen(function*() {
    const verified = yield* Effect.result(verifyRequestState(requestState))
    return yield* Result.match(verified, {
      onFailure: () => Effect.fail(new McpSchema.InvalidParams({ message: 'the confirmation state is invalid' })),
      onSuccess: (claims) =>
        Bool.every([
            claims.tool === expected.tool,
            claims.digest === expected.digest,
            claims.subject === expected.subject,
          ])
          ? approvalOf(request, context)
          : Effect.fail(new McpSchema.InvalidParams({ message: 'the confirmation state names another request' })),
    })
  })

const modernOf = <R>(
  request: ConfirmRequest<R>,
  context: McpSchema.McpRequestContext['Service'],
): Effect.Effect<
  McpSchema.CallToolResult | McpSchema.InputRequired,
  McpSchema.InternalError | McpSchema.InvalidParams,
  R | McpConfirmationKey
> =>
  Effect.gen(function*() {
    const now = yield* Clock.currentTimeMillis
    const digest = yield* argumentDigest(request.invocation.input)
    const expected: ConfirmationClaims = {
      tool: request.tool,
      digest,
      subject: subjectOf(request.invocation.principal),
      expiresAt: confirmationExpiry(now),
    }
    return yield* Option.match(Option.fromUndefinedOr(context.requestState), {
      onNone: () => Effect.map(signRequestState(expected), (requestState) => inputRequiredOf(request, requestState)),
      onSome: (requestState) => retryOf(request, context, requestState, expected),
    })
  })

const legacyOf = <R>(
  request: ConfirmRequest<R>,
  context: McpSchema.McpRequestContext['Service'],
): Effect.Effect<McpSchema.CallToolResult, McpSchema.InternalError, R> =>
  Option.match(Option.fromUndefinedOr(context.clientCapabilities.elicitation), {
    onNone: () => Effect.succeed(ConfirmationUnavailable),
    onSome: () =>
      Effect.gen(function*() {
        const client = yield* Effect.serviceOption(McpSchema.McpServerClient)
        return yield* Option.match(client, {
          onNone: () => Effect.succeed(ConfirmationUnavailable),
          onSome: (service) =>
            Effect.gen(function*() {
              const approved = yield* Effect.result(
                McpServer.elicit({
                  message: confirmationMessage(request),
                  schema: Schema.Struct({ approve: Schema.Boolean }),
                }),
              )
              return yield* Result.match(approved, {
                onFailure: () => Effect.succeed(ConfirmationDeclined),
                onSuccess: (content) => declinedOrRun(request, content.approve),
              })
            }).pipe(Effect.provideService(McpSchema.McpServerClient, service)),
        })
      }),
  })

export const confirmed = <R = never>(
  request: ConfirmRequest<R>,
): Effect.Effect<
  McpSchema.CallToolResult | McpSchema.InputRequired,
  McpSchema.InternalError | McpSchema.InvalidParams,
  R | McpConfirmationKey | McpSchema.McpRequestContext
> =>
  Effect.gen(function*() {
    const context = yield* McpSchema.McpRequestContext
    return yield* Match.value(context.protocolVersion).pipe(
      Match.when(MODERN_PROTOCOL, () => modernOf(request, context)),
      Match.orElse(() => legacyOf(request, context)),
    )
  })
