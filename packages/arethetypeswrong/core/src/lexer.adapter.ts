import { Context, Effect, Layer } from 'effect'

export interface LexerAdapterService {
  readonly init: () => Effect.Effect<void, Error>
  readonly parseCjsExports: (source: string) => Effect.Effect<ReadonlyArray<string>, Error>
}

export class LexerAdapter extends Context.Tag('@systemfsoftware/arethetypeswrong-core/LexerAdapter')<
  LexerAdapter,
  LexerAdapterService
>() {}

export const LexerAdapterStub: Layer.Layer<LexerAdapter, never, never> = Layer.succeed(
  LexerAdapter,
  {
    init: () => Effect.succeed(undefined),
    parseCjsExports: (_source) => Effect.succeed([]),
  },
)
