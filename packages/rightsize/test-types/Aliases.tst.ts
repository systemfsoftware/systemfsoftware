/**
 * U12 alias-resolution pins (R16): every testcontainers-parity alias on the
 * public surface resolves to the SAME canonical member — type identity, not
 * near-compatibility. If an alias ever forks from its canonical member (a
 * copy-paste drift, an overload that no longer accepts what the canonical
 * accepts), one of these pins fails at `test:types`.
 *
 * The aliases under test:
 *  - `withEnvironment` (export alias) ≡ `withEnvPairs` (canonical combinator)
 *  - `withWaitStrategy` (combinator alias) ≡ `waitingFor` (canonical)
 *  - `RunningContainer.remove` (dual-surface alias) ≡ `RunningContainer.stop`
 *  - `RunningContainer.getHost` ≡ the `host` field it reads through
 *  - `RunningContainer.getMappedPort` ≡ the `spec.ports` lookup it performs
 */
import { describe, expect, it } from 'tstyche'
import type { GenericContainer, RunningContainer } from '../src/generic-container.js'
import { fromImage, withEnvironment, withWaitStrategy } from '../src/index.js'
import type { waitingFor } from '../src/model/spec-combinators.js'
import { withEnvPairs } from '../src/model/spec-combinators.js'

describe('the combinator aliases resolve to their canonical members by type identity', () => {
  it('Should_ReexportTheCanonicalCombinator_When_WithEnvironmentIsUsed', () => {
    expect<typeof withEnvironment>().type.toBe<typeof withEnvPairs>()
  })

  it('Should_ResolveToTheSameSpecTransformation_When_WithWaitStrategyIsUsed', () => {
    expect<typeof withWaitStrategy>().type.toBe<typeof waitingFor>()
  })

  it('Should_AcceptAnImageString_When_FromImageIsCalled', () => {
    expect<typeof fromImage>().type.toBeCallableWith('redis:8.6-alpine')
  })
})

describe('the dual-surface aliases on RunningContainer', () => {
  it('Should_GiveTheAliasTheStopContract_When_RemoveIsUsed', () => {
    expect<RunningContainer['remove']>().type.toBe<RunningContainer['stop']>()
  })

  it('Should_ReportTheHostField_When_GetHostIsUsed', () => {
    expect<ReturnType<RunningContainer['getHost']>>().type.toBe<RunningContainer['host']>()
  })

  it('Should_LookUpTheExposedBinding_When_GetMappedPortIsUsed', () => {
    expect<RunningContainer['getMappedPort']>().type.toBe<(guestPort: number) => number | undefined>()
  })
})

describe('the facade alias surface carries the canonical strategy data', () => {
  it('Should_AcceptForPortData_When_WithWaitStrategyIsChained', () => {
    const container = fromImage('redis:8.6-alpine').withWaitStrategy({ _tag: 'ForPort' })
    expect<Exclude<typeof container.spec.waitStrategy, undefined>>().type.toBeAssignableFrom<{
      readonly _tag: 'ForPort'
    }>()
  })
})

describe('the facade exposes every testcontainers-parity with* alias', () => {
  it('Should_ExposeTheParityAliases_When_GenericContainerIsUsed', () => {
    expect<GenericContainer>().type.toHaveProperty('withCommand')
    expect<GenericContainer>().type.toHaveProperty('withEntrypoint')
    expect<GenericContainer>().type.toHaveProperty('withEnv')
    expect<GenericContainer>().type.toHaveProperty('withExposedPorts')
    expect<GenericContainer>().type.toHaveProperty('withWorkingDir')
    expect<GenericContainer>().type.toHaveProperty('withNetwork')
    expect<GenericContainer>().type.toHaveProperty('withNetworkAliases')
    expect<GenericContainer>().type.toHaveProperty('withStartupTimeout')
    expect<GenericContainer>().type.toHaveProperty('withWaitStrategy')
    expect<GenericContainer>().type.toHaveProperty('withReuse')
    expect<GenericContainer>().type.toHaveProperty('withMemoryLimit')
    expect<GenericContainer>().type.toHaveProperty('withDiskLimit')
    expect<GenericContainer>().type.toHaveProperty('withTmpfsRoot')
    expect<GenericContainer>().type.toHaveProperty('withRequireIsolation')
    expect<GenericContainer>().type.toHaveProperty('withNetworkDisabled')
    expect<GenericContainer>().type.toHaveProperty('withCopyFileToContainer')
    expect<GenericContainer>().type.toHaveProperty('withCopyDirectoryToContainer')
  })

  it('Should_ExposeTheRunningSurfaceAliases_When_TheContainerIsStarted', () => {
    expect<RunningContainer>().type.toHaveProperty('getHost')
    expect<RunningContainer>().type.toHaveProperty('getMappedPort')
    expect<RunningContainer>().type.toHaveProperty('exec')
    expect<RunningContainer>().type.toHaveProperty('logs')
    expect<RunningContainer>().type.toHaveProperty('followOutput')
    expect<RunningContainer>().type.toHaveProperty('copyFileToContainer')
    expect<RunningContainer>().type.toHaveProperty('copyFileFromContainer')
  })
})
