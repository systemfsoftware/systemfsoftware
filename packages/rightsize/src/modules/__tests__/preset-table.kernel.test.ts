/**
 * Scenario pinning for the preset catalog (R13, KTD11): the registry is a
 * data table, so the table itself carries the contract. These scenario tests
 * pin the exact upstream-derived facts — the catalog enumeration, memory
 * floors, readiness-step declarations, the image-compatibility gate, and the
 * row JSON round-trip — while the sibling `.property.test.ts` file holds the
 * per-row laws.
 */
import { describe, expect, it } from '@effect/vitest'
import { Option, Result, Schema as S } from 'effect'
import {
  asCompatibleSubstituteFor,
  parseImageReference,
  requireCompatibleImage,
} from '../../model/docker-image-name.js'
import { allPresets, presetById } from '../index.js'
import { ModulePreset } from '../preset.schema.js'
import { defaultImageOf, substituteMappedPorts } from '../spec-builder.js'

/** The complete closed id set, upstream-module order (upstream `src/modules/index.ts` at the fork point), floci expanded into its three provider variants in its slot. */
const EXPECTED_IDS: ReadonlyArray<string> = [
  'redis',
  'valkey',
  'memcached',
  'arango',
  'mongodb',
  'redpanda',
  'kafka',
  'spring-cloud-config',
  'postgres',
  'mysql',
  'pinot',
  'rabbitmq',
  'mariadb',
  'flink',
  'wiremock',
  'keycloak',
  'clickhouse',
  'neo4j',
  'floci-aws',
  'floci-azure',
  'floci-gcp',
  'minio',
  'cassandra',
  'elasticsearch',
  'qdrant',
]

/** The upstream memory floors (MB) a heavyweight image cannot boot under — measured upstream, kept verbatim. */
export const MEMORY_FLOORS: Readonly<Record<string, number>> = {
  'spring-cloud-config': 1024,
  pinot: 4096,
  cassandra: 2560,
  elasticsearch: 2560,
  neo4j: 1024,
  keycloak: 1024,
  flink: 1024,
}

const idOf = (preset: { readonly id: string }): string => preset.id

/** The registry is static and closed — a missing id is a table bug, and throwing names it loudly. */
const requirePreset = (id: string): ModulePreset =>
  Option.getOrThrowWith(presetById(id), () => new Error(`preset '${id}' missing from registry`))

describe('preset catalog — table invariants (R13, KTD11)', () => {
  it('Should_MatchTheUpstreamCatalog_When_RegistryEnumerated', () => {
    expect(allPresets().map(idOf)).toStrictEqual(EXPECTED_IDS)
  })

  it('Should_ResolveEveryIdUniquely_When_RegistryLookedUp', () => {
    const ids = allPresets().map(idOf)
    expect(ids.every((id) => Option.isSome(presetById(id)))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('Should_CarryTheUpstreamMemoryFloors_When_HeavyweightImageDeclared', () => {
    for (const [id, floor] of Object.entries(MEMORY_FLOORS)) {
      expect(requirePreset(id).memoryLimitMb).toBe(floor)
    }
  })

  it('Should_DeclareNoFloorBeyondUpstream_When_CatalogIsLightweight', () => {
    const lightweightFloors: unknown[] = []
    for (const row of allPresets()) {
      if (MEMORY_FLOORS[row.id] === undefined) lightweightFloors.push(row.memoryLimitMb)
    }
    expect(lightweightFloors.every((floor) => floor === undefined)).toBe(true)
  })

  it('Should_KeepDeclaredPortsUnique_When_CatalogEnumerated', () => {
    for (const row of allPresets()) {
      expect(new Set(row.ports).size).toBe(row.ports.length)
    }
  })

  it('Should_AnchorEveryWaitPort_When_ReadinessDeclared', () => {
    const dangling: string[] = []
    for (const row of allPresets()) {
      const wait = row.waitStrategy
      if (wait._tag === 'ForHttp' && wait.port !== undefined && !row.ports.includes(wait.port)) {
        dangling.push(row.id)
      }
    }
    expect(dangling).toStrictEqual([])
  })

  it('Should_DeclareTheVersionProbe_When_MemcachedReadinessDeclared', () => {
    expect(requirePreset('memcached').readinessSteps).toStrictEqual([
      {
        _tag: 'ProtocolReply',
        description: 'reply to a VERSION probe',
        guestPort: 11211,
        send: 'version\r\n',
        expectedPrefix: 'VERSION',
        timeoutMs: 60_000,
      },
    ])
  })

  it('Should_DeclareReplicaSetInitiation_When_MongodbReadinessDeclared', () => {
    const steps = requirePreset('mongodb').readinessSteps
    expect(steps[0]).toStrictEqual({
      _tag: 'ExecSucceeds',
      description: 'rs.initiate to succeed',
      command: ['mongosh', '--quiet', '--eval', 'try { rs.status() } catch (e) { rs.initiate() }'],
      timeoutMs: 180_000,
    })
    expect(steps[1]).toMatchObject({
      _tag: 'ExecStdoutEndsWith',
      description: 'a PRIMARY to be elected',
      command: ['mongosh', '--quiet', '--eval', 'db.hello().isWritablePrimary'],
      suffix: 'true',
    })
  })
})

describe('preset image-compatibility gate (R13 — IncompatibleImageError before any I/O)', () => {
  it('Should_AcceptEveryDefaultImage_When_ItsModuleGateApplies', () => {
    const gates: boolean[] = []
    for (const row of allPresets()) {
      const image = row.image
      if (image === undefined) {
        gates.push(true) // elasticsearch: no floating default, caller must supply
        continue
      }
      const gate = requireCompatibleImage(image, row.expectedRepository)
      gates.push(Result.isSuccess(gate) && gate.success === image)
    }
    expect(gates.every(Boolean)).toBe(true)
  })

  it('Should_RejectAForeignRepository_When_GateApplies', () => {
    const foreignRepository =
      allPresets().find((candidate) => candidate.expectedRepository !== 'redis')?.expectedRepository ?? 'unknown'
    const gate = requireCompatibleImage(`${foreignRepository}:2`, 'redis')
    expect(Result.isFailure(gate)).toBe(true)
    expect(gate).toMatchObject({ failure: { _tag: 'IncompatibleImageError', expectedRepository: 'redis' } })
  })

  it('Should_AcceptOverride_When_SubstituteRepositoryDeclared', () => {
    const parsed = parseImageReference('myorg/redis:8.6-alpine')
    const image = Result.getOrThrow(parsed)
    const substituted = asCompatibleSubstituteFor(image, 'redis')
    expect(requireCompatibleImage(substituted, 'redis')).toStrictEqual(Result.succeed('myorg/redis:8.6-alpine'))
  })
})

describe('spec-builder behaviour (KTD11 — the one interpreter)', () => {
  it('Should_InterpolateMappedHostPorts_When_TemplateReferencesGuestPorts', () => {
    const bindings = [
      { hostPort: 39001, guestPort: 9092 },
      { hostPort: 39002, guestPort: 9093 },
    ]
    expect(substituteMappedPorts('PLAINTEXT://127.0.0.1:${port:9092},INTERNAL://redpanda:${port:9093}', bindings))
      .toBe('PLAINTEXT://127.0.0.1:39001,INTERNAL://redpanda:39002')
  })

  it('Should_LeaveUnknownPlaceholdersUnsubstituted_When_PortNotMapped', () => {
    expect(substituteMappedPorts('x-${port:9999}', [{ guestPort: 6379, hostPort: 38000 }])).toBe('x-${port:9999}')
  })

  it('Should_ReferenceDefaultImages_When_RowCarriesOne', () => {
    expect(Option.flatMap(presetById('redis'), defaultImageOf)).toStrictEqual(Option.some('redis:latest'))
  })

  it('Should_LeaveDefaultImageUnset_When_ElasticsearchRowDeclaresNone', () => {
    expect(Option.flatMap(presetById('elasticsearch'), defaultImageOf)).toStrictEqual(Option.none())
  })
})

describe('preset table — JSON round-trip', () => {
  it('Should_RoundTripEveryRow_When_JsonEncodedBackAndForth', () => {
    const encode = S.encodeSync(ModulePreset)
    const decode = S.decodeUnknownSync(ModulePreset)
    const equality = S.toEquivalence(ModulePreset)
    const results = allPresets().map((row) => equality(decode(JSON.parse(JSON.stringify(encode(row)))), row))
    expect(results.every(Boolean)).toBe(true)
  })
})
