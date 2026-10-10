/// <reference types="vitest/importMeta" />
import { Result, Schema } from 'effect'

const IMAGE_REFERENCE_REGEXP = new RegExp(
  '^(?:[a-z0-9]+(?:(?:[._]|__|[-]+)[a-z0-9]+)*(?:/[a-z0-9]+(?:(?:[._]|__|[-]+)[a-z0-9]+)*)*)(?::[a-zA-Z0-9][a-zA-Z0-9._-]{0,127})?(?:@[A-Za-z][A-Za-z0-9]*(?:[-_+.][A-Za-z][A-Za-z0-9]*)*:[0-9a-fA-F]{32,})?$',
)

export const ImageReference = Schema.String.pipe(Schema.check(Schema.isPattern(IMAGE_REFERENCE_REGEXP)))
export type ImageReference = typeof ImageReference.Type

export const GuestPort = Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 65535 })))
export type GuestPort = typeof GuestPort.Type

export const HttpWait = Schema.TaggedStruct('Http', {
  path: Schema.String.pipe(Schema.check(Schema.isStartingWith('/'))),
  port: GuestPort,
})
export type HttpWait = typeof HttpWait.Type

export const PortWait = Schema.TaggedStruct('Port', { port: GuestPort })
export type PortWait = typeof PortWait.Type

export const PortProbe = Schema.Union([
  Schema.TaggedStruct('Tcp', {}),
  Schema.TaggedStruct('Http', {
    path: Schema.String.pipe(Schema.check(Schema.isStartingWith('/'))),
  }),
])
export type PortProbe = typeof PortProbe.Type

export const ExposedPort = Schema.Struct({
  port: GuestPort,
  probe: Schema.optional(PortProbe),
})
export type ExposedPort = typeof ExposedPort.Type
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

export const BaseSpec = Schema.Struct({
  image: ImageReference,
  env: Schema.Record(Schema.String, Schema.String),
  mounts: Schema.Array(Mount).pipe(Schema.check(Schema.isUnique())),
  memoryMb: Schema.optional(Schema.Finite.pipe(Schema.check(Schema.isGreaterThan(0)))),
  vCPUs: Schema.optional(Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1)))),
})
export type BaseSpec = typeof BaseSpec.Type

export const ServiceSpec = Schema.TaggedStruct('Service', {
  ...BaseSpec.fields,
  ports: Schema.Array(GuestPort).pipe(Schema.check(Schema.isUnique())),
  waitStrategy: Schema.optional(WaitStrategy),
})
export type ServiceSpec = typeof ServiceSpec.Type

export const JobSpec = Schema.TaggedStruct('Job', {
  ...BaseSpec.fields,
  cmd: Schema.NonEmptyArray(Schema.String),
  workdir: Schema.optional(Schema.String),
  hostAccess: Schema.optional(Schema.Boolean),
})
export type JobSpec = typeof JobSpec.Type

export const MicroVMSpec = Schema.Union([ServiceSpec, JobSpec])
export type MicroVMSpec = typeof MicroVMSpec.Type

const imageReferenceDecodes = (candidate: string): boolean =>
  Result.isSuccess(Schema.decodeResult(ImageReference)(candidate))

const SPEC_IMAGE_REFERENCE_VERDICT: Record<string, readonly [string, boolean]> = {
  singleComponent: ['alpine:3.20', true],
  registryPath: ['library/alpine:3.20', true],
  digestReference: [`alpine@sha256:${'a'.repeat(64)}`, true],
  widenedDigestSeparator: [`alpine@a!:${'a'.repeat(32)}`, false],
  uppercaseComponent: ['ALPINE', false],
  emptyReference: ['', false],
}

const presentOrAbsent = <A>(present: boolean, value: A): A | undefined => present ? value : undefined

const exposedPortDecodes = (hasPort: boolean): boolean =>
  Result.isSuccess(Schema.decodeUnknownResult(ExposedPort)({ port: presentOrAbsent(hasPort, 8080) }))

const namesItsPort = (hasPort: boolean): boolean => hasPort

if (import.meta.vitest !== void 0) {
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀l_ImageReferenceRefusal_≡Spec',
    { of: [Schema.Literals(Object.keys(SPEC_IMAGE_REFERENCE_VERDICT))], subject: imageReferenceDecodes },
    (subject, [label]) => {
      const verdict = SPEC_IMAGE_REFERENCE_VERDICT[label]
      return verdict !== undefined && subject(verdict[0]) === verdict[1]
    },
  )

  it.prop(
    '∀p_ExposedPortRefusal_≡HasPort',
    { of: [Schema.Boolean], subject: exposedPortDecodes },
    (subject, [hasPort]) => subject(hasPort) === namesItsPort(hasPort),
  )
}
