import * as NodeSocketServer from '@effect/platform-node/NodeSocketServer'
import { Context, Effect, Option } from 'effect'
import type * as Scope from 'effect/Scope'
import { PortAllocationError } from './MicroVMError.schema.js'
import type { GuestPort } from './MicroVMSpec.schema.js'
import type { PortBinding } from './render-sandbox-plan.schema.js'

const LOOPBACK_HOST = '127.0.0.1'

export interface PortAllocatorShape {
  readonly reserve: (guest: GuestPort) => Effect.Effect<PortBinding, PortAllocationError, Scope.Scope>
}

const reserve = (guest: GuestPort): Effect.Effect<PortBinding, PortAllocationError, Scope.Scope> =>
  NodeSocketServer.make({ host: LOOPBACK_HOST, port: 0 }).pipe(
    Effect.mapError((cause) => new PortAllocationError({ guestPort: guest, cause })),
    Effect.flatMap((server) => {
      const address = server.address
      return Option.match(Option.fromNullishOr('port' in address ? address.port : undefined), {
        onNone: () => Effect.fail(new PortAllocationError({ guestPort: guest })),
        onSome: (port) => Effect.succeed<PortBinding>({ guest, host: LOOPBACK_HOST, hostPort: port }),
      })
    }),
  )

export const PortAllocator: Context.Reference<PortAllocatorShape> = Context.Reference<PortAllocatorShape>(
  '@systemfsoftware/effect-microsandbox/PortAllocator',
  { defaultValue: () => ({ reserve }) },
)
