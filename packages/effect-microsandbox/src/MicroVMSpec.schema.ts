/// <reference types="vitest/importMeta" />
import { Schema } from 'effect'

const IMAGE_REFERENCE_REGEXP = new RegExp(
  '^(?:[a-z0-9]+(?:(?:[._]|__|[-]+)[a-z0-9]+)*(?:/[a-z0-9]+(?:(?:[._]|__|[-]+)[a-z0-9]+)*)*)(?::[a-zA-Z0-9][a-zA-Z0-9._-]{0,127})?(?:@[A-Za-z][A-Za-z0-9]*(?:[-_+.][A-Za-z][A-Za-z0-9]*)*:[0-9a-fA-F]{32,})?$',
)

export const ImageReference = Schema.String.pipe(Schema.check(Schema.isPattern(IMAGE_REFERENCE_REGEXP)))
export type ImageReference = typeof ImageReference.Type

export const GuestPort = Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 65535 })))
export type GuestPort = typeof GuestPort.Type

export const HttpWait = Schema.TaggedStruct('Http', {
  path: Schema.String.pipe(Schema.check(Schema.isStartsWith('/'))),
  port: GuestPort,
})
export type HttpWait = typeof HttpWait.Type

export const PortWait = Schema.TaggedStruct('Port', { port: GuestPort })
export type PortWait = typeof PortWait.Type

export const LogWait = Schema.TaggedStruct('Log', {
  pattern: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
})
export type LogWait = typeof LogWait.Type

export const WaitStrategy = Schema.Union([HttpWait, PortWait, LogWait])
export type WaitStrategy = typeof WaitStrategy.Type

export const Mount = Schema.Struct({
  host: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
  guest: Schema.String.pipe(Schema.check(Schema.isNonEmpty())),
})
export type Mount = typeof Mount.Type

export const MicroVMSpec = Schema.Struct({
  image: ImageReference,
  env: Schema.Record(Schema.String, Schema.String),
  ports: Schema.Array(GuestPort).pipe(Schema.check(Schema.isUnique())),
  mounts: Schema.Array(Mount),
  memoryMb: Schema.optional(Schema.Finite.pipe(Schema.check(Schema.isGreaterThan(0)))),
  vCPUs: Schema.optional(Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1)))),
  workdir: Schema.optional(Schema.String),
  cmd: Schema.optional(Schema.Array(Schema.String)),
  waitStrategy: Schema.optional(WaitStrategy),
})
export type MicroVMSpec = typeof MicroVMSpec.Type
