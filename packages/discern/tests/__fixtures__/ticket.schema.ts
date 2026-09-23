import { Schema } from 'effect'

export const Ticket = Schema.Record(Schema.String, Schema.Finite)
export type Ticket = typeof Ticket.Type
