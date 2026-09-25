import { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import { Effect } from 'effect'
import { makeLoopbackServer } from './loopback-server.js'
import { declaration, port } from './socket-medium.js'
import type { SocketProgram } from './socket-program.js'

/**
 * The socket medium's pairwise driver: each scripted child role dials its own
 * loopback fixture, and the control channel drives that fixture's server side —
 * the peer the current incarnation actually holds.
 */
export const conformanceDriver: Conformance.ConformanceDriver<SocketProgram, never, never> = {
  name: 'socket',
  declaration,
  port,
  launch: (_childId, _script) =>
    Effect.map(Effect.orDie(makeLoopbackServer), (server) => ({
      program: { address: server.address, ready: server.ready },
      control: { advance: server.advance },
    })),
}
