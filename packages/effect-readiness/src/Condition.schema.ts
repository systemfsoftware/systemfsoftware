import { Schema } from 'effect'
import { dual } from 'effect/Function'
import { PortNumber } from './Port.schema.js'

export const TcpCondition = Schema.TaggedStruct('Tcp', { guestPort: PortNumber })
export const HttpCondition = Schema.TaggedStruct('Http', { guestPort: PortNumber, path: Schema.String })
export const LogCondition = Schema.TaggedStruct('Log', { pattern: Schema.String })
export const Condition = Schema.Union([TcpCondition, HttpCondition, LogCondition])
export type Condition = typeof Condition.Type

/** The TCP condition a wait polls: the guest port whose mapped host socket it dials. */
export const waitForTcp = (guestPort: PortNumber): Condition => ({ _tag: 'Tcp', guestPort })

/** The HTTP condition a wait polls: the path requested over the guest port's mapped host socket. */
export const waitForHttp: {
  (guestPort: PortNumber): (path: string) => Condition
  (path: string, guestPort: PortNumber): Condition
} = dual(
  2,
  (path: string, guestPort: PortNumber): Condition => ({ _tag: 'Http', guestPort, path }),
)

/** The log condition a wait polls: the pattern matched against the guest's log entries. */
export const waitForLog = (pattern: string): Condition => ({ _tag: 'Log', pattern })
