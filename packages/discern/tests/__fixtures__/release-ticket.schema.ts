import { Schema } from 'effect'

export const ReleaseTicket = Schema.Struct({
  ask: Schema.String,
  environment: Schema.String,
  evidence: Schema.String,
})

export type ReleaseTicket = typeof ReleaseTicket.Type

export const ticket = (ask: string, environment = 'production', evidence = 'a very large blob'): ReleaseTicket => ({
  ask,
  environment,
  evidence,
})
