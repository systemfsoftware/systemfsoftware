import { Array as Arr, Boolean as Bool, Result, Schema } from 'effect'

const dnsName = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export const Host = Schema.String.pipe(
  Schema.check(Schema.isMaxLength(253), Schema.isPattern(dnsName)),
  Schema.brand('Host'),
)
export type Host = typeof Host.Type

export class Closed extends Schema.TaggedClass<Closed>()('Closed', {}) {}

export class AllowList extends Schema.TaggedClass<AllowList>()('AllowList', { hosts: Schema.NonEmptyArray(Host) }) {}

export const Egress = Schema.Union([Closed, AllowList])
export type Egress = typeof Egress.Type

const seeds = [
  '',
  'localhost',
  'example.com',
  'api.example.com',
  'EXAMPLE.com',
  '127.0.0.1',
  '-a.com',
  'a-.com',
  'a..com',
  'a.b',
  'xn--bcher-kva.example',
  `${'a'.repeat(64)}.com`,
  `${'a'.repeat(63)}.com`,
  `${Array.from({ length: 64 }, () => 'abc').join('.')}.com`,
]

const lowerAscii = 'abcdefghijklmnopqrstuvwxyz'
const labelEdge = `${lowerAscii}0123456789`
const labelInner = `${labelEdge}-`

const isLabel = (label: string): boolean =>
  Bool.every([
    label.length >= 1,
    label.length <= 63,
    labelEdge.includes(label.charAt(0)),
    labelEdge.includes(label.charAt(label.length - 1)),
    Arr.every(Array.from(label), (char) => labelInner.includes(char)),
  ])

const isDnsHostName = (host: string): boolean =>
  Bool.every([
    host.length <= 253,
    host.split('.').length >= 2,
    Arr.every(host.split('.'), isLabel),
    lowerAscii.includes(host.slice(host.lastIndexOf('.') + 1).charAt(0)),
  ])

const hostDecodes = (host: string): boolean => Result.isSuccess(Schema.decodeResult(Host)(host))

if (import.meta.vitest !== void 0) {
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀s_HostRefusal_≡DnsNameNeverIpLiteral',
    { of: [Schema.String], subject: hostDecodes },
    (subject, [host]) =>
      Arr.every(Arr.append(seeds, host), (candidate) => subject(candidate) === isDnsHostName(candidate)),
  )
}
