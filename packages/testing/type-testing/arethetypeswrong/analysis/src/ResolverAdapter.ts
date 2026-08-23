import { Context, Effect, Layer } from 'effect'

import type { ResolutionKind } from './Problem.schema.js'

export interface ResolverResolution {
  readonly fileName: string | undefined
  readonly isTypeScript: boolean
  readonly isJson: boolean
  readonly trace: readonly string[]
}

export interface ResolverAdapterService {
  readonly resolve: (
    packageName: string,
    entrypoint: string,
    resolutionKind: ResolutionKind,
  ) => Effect.Effect<ResolverResolution, never>
}

export class ResolverAdapter extends Context.Service<ResolverAdapter, ResolverAdapterService>()(
  '@systemfsoftware/arethetypeswrong/ResolverAdapter',
) {}

export const ResolverAdapterStub: Layer.Layer<ResolverAdapter, never, never> = Layer.succeed(
  ResolverAdapter,
  {
    resolve: (_packageName, _entrypoint, _resolutionKind) =>
      Effect.succeed({ fileName: undefined, isTypeScript: false, isJson: false, trace: [] }),
  },
)
