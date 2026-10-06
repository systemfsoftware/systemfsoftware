import { Contract } from '@systemfsoftware/effect-contract'
import { Effect, Layer, Option, Schema } from 'effect'
import { ToolCall } from './lifetime.schema.js'

export interface ToolDispatcherCtx {
  readonly props: {
    readonly programId: string
    readonly principal: Schema.Codec.Encoded<typeof Contract.Principal>
  }
}

export type ToolDispatcherHandler = (ctx: ToolDispatcherCtx, request: Request) => Promise<Response>

export interface ToolDispatcherOptions<R> {
  readonly capabilities: Contract.Capabilities<R>
  readonly provide: Layer.Layer<R>
}

const problem = (tag: 'Unavailable' | 'Rejected', reason: string): Response =>
  Response.json({ _tag: tag, reason }, { status: tag === 'Rejected' ? 400 : 503 })

export const toolDispatcherOf = <R>(options: ToolDispatcherOptions<R>): ToolDispatcherHandler => (ctx, request) =>
  Effect.runPromise(
    Effect.match(
      Effect.gen(function*() {
        const text = yield* Effect.promise(() => request.text())
        const call = yield* Schema.decodeEffect(Schema.fromJsonString(ToolCall))(text)
        const principal = yield* Schema.decodeEffect(Contract.Principal)(ctx.props.principal)
        return yield* Option.match(Option.fromUndefinedOr(options.capabilities[call.capability]), {
          onNone: () => Effect.succeed(problem('Unavailable', `no capability named ${call.capability}`)),
          onSome: (capability) =>
            capability.cell.run({ input: call.input, principal }).pipe(
              Effect.flatMap((answer) =>
                Effect.map(
                  Schema.encodeEffect(Schema.toCodecJson(capability.contract.answer))(answer),
                  (encoded) => Response.json(encoded),
                )
              ),
              Effect.catch((error) => Effect.succeed(problem('Unavailable', error._tag))),
              Effect.provide(options.provide),
            ),
        })
      }),
      {
        onFailure: () => problem('Rejected', 'the tool call was not a valid JSON tool call'),
        onSuccess: (response) => response,
      },
    ).pipe(Effect.orDie),
  )
