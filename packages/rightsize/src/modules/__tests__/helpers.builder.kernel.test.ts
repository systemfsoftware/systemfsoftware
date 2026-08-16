/**
 * Scenario pinning for the preset helper interpreter (KTD11 — helpers are
 * declared as data and built by one interpreter function over the started
 * container's port map). Each test pins the exact upstream helper contract:
 * URI schemes, credential embedding from the spec env, path/query suffixes,
 * host:port addresses, numeric mapped-port helpers, constants, and the
 * missing-binding case.
 */
import { describe, expect, it } from '@effect/vitest'
import { Option } from 'effect'
import type { EnvPair } from '../../model/container-spec.schema.js'
import type { PortBinding } from '../../model/ports.schema.js'
import { buildHelperValue, hostPortFor } from '../helpers.js'
import { presetById } from '../index.js'
import type { PresetHelper } from '../preset.schema.js'

const binding = (guestPort: number, hostPort: number): PortBinding => ({ guestPort, hostPort })

/** Grabs a preset row from the static registry — a missing id is a table bug that deserves a loud throw. */
const presetRow = (id: string): ReturnType<typeof presetById> extends Option.Option<infer T> ? T : never =>
  Option.getOrThrowWith(presetById(id), () => new Error(`preset '${id}' missing from registry`))

const envPair = (key: string, value: string): EnvPair => [key, value]

/** A row's helper is statically declared — a missing name is a table bug worth a loud throw. */
const helperOf = (preset: { readonly helpers: Readonly<Record<string, PresetHelper>> }, name: string): PresetHelper => {
  const helper = preset.helpers[name]
  if (helper === undefined) throw new Error(`helper '${name}' missing from preset`)
  return helper
}

const redis = presetRow('redis')
const postgres = presetRow('postgres')
const mongodb = presetRow('mongodb')
const rabbitmq = presetRow('rabbitmq')
const cassandra = presetRow('cassandra')
const wiremock = presetRow('wiremock')
const neo4j = presetRow('neo4j')

describe('preset helper builders — port-map-derived URI families', () => {
  it('Should_BuildTheRedisUri_When_PortMapCarriesTheGuestPort', () => {
    const uri = buildHelperValue(helperOf(redis, 'uri'), [binding(6379, 39001)], redis.env)
    expect(uri).toStrictEqual(Option.some('redis://127.0.0.1:39001'))
  })

  it('Should_BuildTheMongodbConnectionString_When_PathAndQueryDeclared', () => {
    const connectionString = buildHelperValue(
      helperOf(mongodb, 'connectionString'),
      [binding(27017, 39002)],
      mongodb.env,
    )
    expect(connectionString).toStrictEqual(Option.some('mongodb://127.0.0.1:39002/test?directConnection=true'))
  })

  it('Should_BuildTheSameConnectionString_When_ReplicaSetAliasRead', () => {
    const primary = buildHelperValue(helperOf(mongodb, 'connectionString'), [binding(27017, 39003)], mongodb.env)
    const alias = buildHelperValue(helperOf(mongodb, 'replicaSetUrl'), [binding(27017, 39003)], mongodb.env)
    expect(primary).toStrictEqual(alias)
  })

  it('Should_BuildTheWireMockAdminUrl_When_PathDeclared', () => {
    const admin = buildHelperValue(helperOf(wiremock, 'adminUrl'), [binding(8080, 39004)], wiremock.env)
    expect(admin).toStrictEqual(Option.some('http://127.0.0.1:39004/__admin'))
  })

  it('Should_BuildTheNeo4jBoltUrl_When_SchemeDeclared', () => {
    const bolt = buildHelperValue(helperOf(neo4j, 'boltUrl'), [binding(7687, 39005)], neo4j.env)
    expect(bolt).toStrictEqual(Option.some('bolt://127.0.0.1:39005'))
  })
})

describe('preset helper builders — credential and database components', () => {
  it('Should_EmbedTheConfiguredCredentials_When_BuildingThePostgresConnectionString', () => {
    const env = [
      envPair('POSTGRES_USER', 'alice'),
      envPair('POSTGRES_PASSWORD', 's3cret'),
      envPair('POSTGRES_DB', 'orders'),
    ]
    const connectionString = buildHelperValue(helperOf(postgres, 'connectionString'), [binding(5432, 39006)], env)
    expect(connectionString).toStrictEqual(Option.some('postgres://alice:s3cret@127.0.0.1:39006/orders'))
  })

  it('Should_FallBackToThePresetDefaults_When_NoOverrideEnvGiven', () => {
    const connectionString = buildHelperValue(
      helperOf(postgres, 'connectionString'),
      [binding(5432, 39007)],
      postgres.env,
    )
    expect(connectionString).toStrictEqual(Option.some('postgres://test:test@127.0.0.1:39007/test'))
  })

  it('Should_BuildTheAmqpUrl_When_UserAndPassConfigured', () => {
    const env = [envPair('RABBITMQ_DEFAULT_USER', 'guest'), envPair('RABBITMQ_DEFAULT_PASS', 'guest')]
    const amqp = buildHelperValue(helperOf(rabbitmq, 'amqpUrl'), [binding(5672, 39008)], env)
    expect(amqp).toStrictEqual(Option.some('amqp://guest:guest@127.0.0.1:39008'))
  })

  it('Should_LeaveCredentialsOut_When_NoCredentialEnvDeclared', () => {
    const endpoint = buildHelperValue(helperOf(wiremock, 'baseUrl'), [binding(8080, 39009)], wiremock.env)
    expect(endpoint).toStrictEqual(Option.some('http://127.0.0.1:39009'))
  })
})

describe('preset helper builders — addresses, port values and constants', () => {
  it('Should_BuildTheContactPoint_When_AddressHelperDeclared', () => {
    const contactPoint = buildHelperValue(helperOf(cassandra, 'contactPoint'), [binding(9042, 39010)], cassandra.env)
    expect(contactPoint).toStrictEqual(Option.some('127.0.0.1:39010'))
  })

  it('Should_BuildTheMappedPortNumber_When_PortValueHelperDeclared', () => {
    const cqlPort = buildHelperValue(helperOf(cassandra, 'cqlPort'), [binding(9042, 39011)], cassandra.env)
    expect(cqlPort).toStrictEqual(Option.some(39011))
  })

  it('Should_ReturnTheConstant_When_ConstantHelperDeclared', () => {
    const datacenter = buildHelperValue(helperOf(cassandra, 'localDatacenter'), [binding(9042, 39012)], cassandra.env)
    expect(datacenter).toStrictEqual(Option.some('datacenter1'))
  })

  it('Should_ResolveToNone_When_ThePortMapLacksTheGuestPort', () => {
    const uri = buildHelperValue(helperOf(redis, 'uri'), [binding(9999, 39013)], redis.env)
    expect(uri).toStrictEqual(Option.none())
  })

  it('Should_ResolveHostPorts_When_TheBindingIsPresent', () => {
    expect(hostPortFor([binding(6379, 39014)], 6379)).toStrictEqual(Option.some(39014))
    expect(hostPortFor([binding(6379, 39014)], 6380)).toStrictEqual(Option.none())
  })
})
