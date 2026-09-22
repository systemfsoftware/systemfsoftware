import { Schema } from 'effect'

export const PortNumber = Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 65_535 })))
export type PortNumber = typeof PortNumber.Type

export const PortBinding = Schema.Struct({
  guest: PortNumber,
  host: Schema.String,
  hostPort: PortNumber,
})
export type PortBinding = typeof PortBinding.Type
