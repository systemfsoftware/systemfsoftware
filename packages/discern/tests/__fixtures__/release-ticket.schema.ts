import { Schema } from 'effect'

export const ReleaseTicket = Schema.Struct({
  ask: Schema.String,
  environment: Schema.String,
  evidence: Schema.String,
})

export type ReleaseTicket = typeof ReleaseTicket.Type

interface TicketOptions {
  readonly ask: string
  readonly environment?: string
  readonly evidence?: string
}

export const ticket = (
  { ask, environment = 'production', evidence = 'a very large blob' }: TicketOptions,
): ReleaseTicket => ({
  ask,
  environment,
  evidence,
})
