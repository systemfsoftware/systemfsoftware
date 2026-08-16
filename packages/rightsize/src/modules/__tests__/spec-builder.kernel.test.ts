/**
 * Scenario pinning for the preset→spec interpreter (R13 / KTD11 — one
 * mechanism, many rows): `buildContainerSpec` lifts a row's data into a
 * `ContainerSpec` via the pure combinators, and `applySpecTransforms`
 * customizes the spec after port allocation exactly like upstream's
 * `customizeSpec` hooks (Kafka's advertised listener, Redpanda's advertised
 * command, ArangoDB's no-auth drop). Side-effects-free by construction:
 * the tables only produce data.
 */
import { describe, expect, it } from '@effect/vitest'
import { Option } from 'effect'
import { presetById } from '../index.js'
import type { ModulePreset } from '../preset.schema.js'
import { applySpecTransforms, buildContainerSpec } from '../spec-builder.js'

const presetRow = (id: string): ModulePreset =>
  Option.getOrThrowWith(presetById(id), () => new Error(`preset '${id}' missing from registry`))

describe('spec-builder — buildContainerSpec', () => {
  it('Should_BuildTheKafkaSpec_When_PresetDataPresent', () => {
    const kafka = presetRow('kafka')
    const spec = buildContainerSpec(kafka, kafka.image ?? 'apache/kafka:latest', 'rz-test-01')
    expect(spec.ports).toStrictEqual([{ hostPort: 0, guestPort: 9092 }])
    expect(spec.env).toContainEqual(['KAFKA_HEAP_OPTS', '-Xmx256M -Xms256M'])
    expect(spec.env).toContainEqual(['KAFKA_NODE_ID', '1'])
    expect(spec.waitStrategy).toStrictEqual({
      _tag: 'ForLogMessage',
      pattern: '.*Kafka Server started.*',
      count: 1,
    })
    expect(spec.command).toBeUndefined()
  })

  it('Should_CarryTheFlinkAliases_When_TheRowDeclaresThem', () => {
    const flink = presetRow('flink')
    const spec = buildContainerSpec(flink, flink.image ?? '', 'rz-test-02')
    expect(spec.aliases).toStrictEqual(['flink-jobmanager'])
    expect(spec.command).toStrictEqual(['jobmanager'])
  })

  it('Should_CarryTheMemoryFloor_When_TheRowDeclaresOne', () => {
    const pinot = presetRow('pinot')
    const spec = buildContainerSpec(pinot, pinot.image ?? '', 'rz-test-03')
    expect(spec.memoryLimitMb).toBe(4096)
  })

  it('Should_CarryTheStartupTimeout_When_TheRowDeclaresOne', () => {
    const cassandra = presetRow('cassandra')
    const spec = buildContainerSpec(cassandra, cassandra.image ?? '', 'rz-test-04')
    expect(spec.startupTimeoutMs).toBe(300_000)
  })

  it('Should_LeaveCommandUnset_When_TheRowDeclaresNone', () => {
    const redis = presetRow('redis')
    const spec = buildContainerSpec(redis, redis.image ?? '', 'rz-test-05')
    expect(spec.command).toBeUndefined()
    expect(spec.waitStrategy).toStrictEqual({
      _tag: 'ForLogMessage',
      pattern: '.*Ready to accept connections.*',
      count: 1,
    })
  })

  it('Should_NotMutateThePreset_When_BuildingASpec', () => {
    const kafka = presetRow('kafka')
    const before = JSON.stringify(kafka)
    buildContainerSpec(kafka, kafka.image ?? '', 'rz-test-06')
    expect(JSON.stringify(kafka)).toBe(before)
  })
})

describe('spec-builder — applySpecTransforms (the customizeSpec data)', () => {
  it('Should_AdvertiseTheMappedPort_When_KafkaEnvTemplateApplies', () => {
    const kafka = presetRow('kafka')
    const spec = buildContainerSpec(kafka, kafka.image ?? '', 'rz-test-07')
    const transformed = applySpecTransforms(kafka, spec, [{ guestPort: 9092, hostPort: 39001 }])
    expect(transformed.env).toContainEqual(['KAFKA_ADVERTISED_LISTENERS', 'PLAINTEXT://127.0.0.1:39001'])
  })

  it('Should_AdvertiseBothListeners_When_RedpandaCommandTemplateApplies', () => {
    const redpanda = presetRow('redpanda')
    const spec = buildContainerSpec(redpanda, redpanda.image ?? '', 'rz-test-08')
    const transformed = applySpecTransforms(redpanda, spec, [
      { guestPort: 9092, hostPort: 39002 },
      { guestPort: 9093, hostPort: 39003 },
      { guestPort: 8081, hostPort: 39004 },
    ])
    expect(transformed.command).toContain('EXTERNAL://127.0.0.1:39002,INTERNAL://redpanda:9093')
  })

  it('Should_DropTheNoAuthDefault_When_RootPasswordEnvPresent', () => {
    const arango = presetRow('arango')
    const spec = buildContainerSpec(arango, arango.image ?? '', 'rz-test-09')
    expect(spec.env).toContainEqual(['ARANGO_NO_AUTH', '1'])
    const withPassword = {
      ...spec,
      env: [...spec.env, ['ARANGO_ROOT_PASSWORD', 'secret'] as const],
    }
    const transformed = applySpecTransforms(arango, withPassword, [])
    expect(transformed.env).not.toContainEqual(['ARANGO_NO_AUTH', '1'])
    expect(transformed.env).toContainEqual(['ARANGO_ROOT_PASSWORD', 'secret'])
  })

  it('Should_KeepTheNoAuthDefault_When_RootPasswordAbsent', () => {
    const arango = presetRow('arango')
    const spec = buildContainerSpec(arango, arango.image ?? '', 'rz-test-10')
    const transformed = applySpecTransforms(arango, spec, [])
    expect(transformed.env).toContainEqual(['ARANGO_NO_AUTH', '1'])
  })
})
