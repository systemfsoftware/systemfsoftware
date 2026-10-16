import { Context, Effect } from 'effect'
import type { ResolvedRuntime } from 'microsandbox'
import { VirtualizationUnsupportedError } from './MicroVMError.schema.js'

export interface RuntimeResolverShape {
  readonly resolve: (platform: string) => Effect.Effect<ResolvedRuntime, VirtualizationUnsupportedError>
}

const announce = (resolved: ResolvedRuntime) =>
  Effect.logInfo('microsandbox runtime resolved', {
    'runtime.path': resolved.msbPath,
    'runtime.origin': resolved.origin,
  })

const resolve = (platform: string): Effect.Effect<ResolvedRuntime, VirtualizationUnsupportedError> =>
  Effect.tryPromise({
    try: () => import('microsandbox'),
    catch: (cause) =>
      new VirtualizationUnsupportedError({
        platform,
        remediation: 'Failed to load microsandbox native runtime',
        cause,
      }),
  }).pipe(
    Effect.flatMap(({ resolveRuntime }) => Effect.sync(() => resolveRuntime())),
    Effect.tap(announce),
  )

export const RuntimeResolver: Context.Reference<RuntimeResolverShape> = Context.Reference<RuntimeResolverShape>(
  '@systemfsoftware/effect-microsandbox/RuntimeResolver',
  { defaultValue: () => ({ resolve }) },
)
