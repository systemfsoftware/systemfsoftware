/**
 * Wire-declaration acceptance tests: decode representative Engine API
 * payloads and encode the request bodies this backend sends (KTD8, R9).
 *
 * These are kernel-shaped contract tests — the wire decode/encode surface is
 * domain-blind pure behavior; the refusal half of the contract lives in
 * `wire.schema.property.test.ts`. The generated schema-laws entry does not
 * cover these declarations (a wire declaration is built from the Wire
 * alphabet, so the laws plugin does not sweep it), which is what licenses an
 * authored acceptance file at all: it is not restating generated coverage.
 */
import { Schema as S } from 'effect'
import * as Result from 'effect/Result'
import { describe, expect, it } from 'vitest'
import { ContainerCreateRequest, ContainerCreateResponse, ContainerInspectResponse } from '../container.schema.js'
import { decodeJsonBody } from '../decode.js'
import { ExecInspectResponse } from '../exec.schema.js'
import { encodeRegistryAuth, ImagePullProgressFrame, RegistryAuthConfig } from '../image.schema.js'
import { encodeLogsQuery, LogsQuery } from '../logs.schema.js'
import { NetworkConnectRequest, NetworkCreateRequest, NetworkCreateResponse } from '../network.schema.js'

/** Asserts success and returns the decoded value. */
const unwrap = <A>(result: Result.Result<A, unknown>): A => {
  expect(Result.isSuccess(result)).toBe(true)
  return Result.isFailure(result) ? (undefined as A) : result.success
}

describe('container create', () => {
  const createRequest = {
    Image: 'example.com/library/redis:7-alpine',
    Env: ['REDIS_AOF_ENABLED=no'],
    Cmd: ['redis-server', '--maxmemory', '64mb'],
    ExposedPorts: { '6379/tcp': {} },
    Labels: { 'dev.rightsize.runId': 'rz-testrun1' },
    HostConfig: {
      PortBindings: { '6379/tcp': [{ HostIp: '127.0.0.1', HostPort: '49213' }] },
      Binds: ['/host/cache:/var/cache:ro'],
      ExtraHosts: ['host.docker.internal:host-gateway'],
      Memory: 64 * 1024 * 1024,
    },
  }

  it('Should_EncodeCreateRequest_When_TheBodyNamesLoopbackPortBindings', () => {
    const encoded = S.encodeSync(ContainerCreateRequest)(createRequest)
    expect(encoded.HostConfig.PortBindings).toEqual({
      '6379/tcp': [{ HostIp: '127.0.0.1', HostPort: '49213' }],
    })
    expect(encoded.HostConfig.Binds).toEqual(['/host/cache:/var/cache:ro'])
    expect(encoded.HostConfig.Memory).toBe(64 * 1024 * 1024)
    expect(encoded.ExposedPorts).toEqual({ '6379/tcp': {} })
  })

  it('Should_RoundTripCreateRequest_When_TheCodecIsApplied', () => {
    const encoded = S.encodeSync(ContainerCreateRequest)(createRequest)
    expect(unwrap(S.decodeResult(ContainerCreateRequest)(encoded))).toEqual(createRequest)
  })

  it('Should_DecodeCreateResponse_When_TheIdIsPresent', () => {
    const result = decodeJsonBody(ContainerCreateResponse, 'containerCreate')(
      JSON.stringify({ Id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90', Warnings: ['a', 'b'] }),
    )
    expect(unwrap(result)).toEqual({ Id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90', Warnings: ['a', 'b'] })
  })

  it('Should_DecodeCreateResponse_When_WarningsAreOmitted', () => {
    expect(unwrap(decodeJsonBody(ContainerCreateResponse, 'containerCreate')('{"Id":"abc123"}'))).toEqual({
      Id: 'abc123',
    })
  })
})

describe('container inspect', () => {
  const inspectFixture = {
    Id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
    Name: '/rz-ab12cd34-redis',
    Created: '2026-08-16T10:00:00.000000000Z',
    Config: { Image: 'redis:7-alpine' },
    State: {
      Status: 'running',
      Running: true,
      Paused: false,
      Restarting: false,
      OOMKilled: false,
      Dead: false,
      Pid: 12345,
      ExitCode: 0,
      Error: '',
      StartedAt: '2026-08-16T10:00:05.000000000Z',
      FinishedAt: '0001-01-01T00:00:00Z',
    },
    NetworkSettings: { Ports: {} },
  }

  const healthyFixture: () => unknown = () => ({
    ...inspectFixture,
    State: {
      ...inspectFixture.State,
      Health: {
        Status: 'healthy',
        FailingStreak: 0,
        Log: [
          {
            Start: '2026-08-16T10:00:05.000000000Z',
            End: '2026-08-16T10:00:05.500000000Z',
            ExitCode: 0,
            Output: '127.0.0.1:6379: ACCEPT\n',
          },
        ],
      },
    },
    NetworkSettings: {
      Ports: {
        '6379/tcp': [{ HostIp: '127.0.0.1', HostPort: '49213' }],
        '8080/tcp': null,
      },
    },
  })

  it('Should_DecodeInspect_When_TheContainerIsHealthyAndPortsAreMapped', () => {
    const decoded = unwrap(
      decodeJsonBody(ContainerInspectResponse, 'containerInspect')(JSON.stringify(healthyFixture())),
    )
    expect(decoded.Id).toBe('a1b2c3d4e5f60718293a4b5c6d7e8f90')
    expect(decoded.State.Running).toBe(true)
    expect(decoded.State.Health?.Status).toBe('healthy')
    expect(decoded.State.Health?.FailingStreak).toBe(0)
    expect(decoded.State.Health?.Log?.[0]?.Output).toContain('ACCEPT')
    expect(decoded.NetworkSettings.Ports?.['6379/tcp']).toEqual([{ HostIp: '127.0.0.1', HostPort: '49213' }])
    expect(decoded.NetworkSettings.Ports?.['8080/tcp']).toBe(null)
  })

  it('Should_TolerateUnownedFields_When_TheDaemonAddsThem', () => {
    // `Created` and `Config` are real inspect members this backend does not
    // read; the declaration restates only the owned subset, and decoding must
    // not fail because the daemon sent more.
    const decoded = unwrap(decodeJsonBody(ContainerInspectResponse, 'containerInspect')(JSON.stringify(inspectFixture)))
    expect(decoded.Name).toBe('/rz-ab12cd34-redis')
  })

  it('Should_DecodeInspect_When_NoHealthcheckIsConfigured', () => {
    const withoutHealth: unknown = { ...inspectFixture, State: { ...inspectFixture.State, Health: undefined } }
    const decoded = unwrap(decodeJsonBody(ContainerInspectResponse, 'containerInspect')(JSON.stringify(withoutHealth)))
    expect(decoded.State.Health).toBeUndefined()
  })
})

describe('exec', () => {
  it('Should_DecodeExecInspect_When_TheProcessExited', () => {
    const result = decodeJsonBody(ExecInspectResponse, 'execInspect')(
      JSON.stringify({
        Id: 'e123',
        ContainerID: 'a1b2',
        Running: false,
        Pid: 0,
        ExitCode: 127,
        OpenStdin: false,
        OpenStdout: true,
        OpenStderr: true,
      }),
    )
    expect(unwrap(result)).toEqual({ Running: false, ExitCode: 127, Pid: 0 })
  })
})

describe('image pull', () => {
  it('Should_DecodeLayerProgressFrames_When_StreamingPullOutput', () => {
    const frame = unwrap(
      decodeJsonBody(ImagePullProgressFrame, 'imagePull')(
        JSON.stringify({
          status: 'Downloading',
          progressDetail: { current: 65536, total: 28710912 },
          progress: '[=>                                                  ]  65.54kB/28.71MB',
          id: 'a8b7c6d5e4f3',
        }),
      ),
    )
    expect(frame.status).toBe('Downloading')
    expect(frame.progressDetail?.current).toBe(65536)
    expect(frame.progressDetail?.total).toBe(28710912)
    expect(frame.id).toBe('a8b7c6d5e4f3')
  })

  it('Should_DecodeTheTerminalErrorFrame_When_ThePullFails', () => {
    const frame = unwrap(
      decodeJsonBody(ImagePullProgressFrame, 'imagePull')(
        JSON.stringify({
          error: 'denied: requested access to the resource is denied',
          errorDetail: { message: 'denied: requested access to the resource is denied' },
        }),
      ),
    )
    expect(frame.error).toContain('denied')
    expect(frame.errorDetail?.message).toContain('denied')
  })
})

describe('registry auth', () => {
  it('Should_EncodeRegistryAuth_When_HeaderCarriesCredentials', () => {
    const header = encodeRegistryAuth({ username: 'ci', password: 's3cret', serveraddress: 'registry.example.com' })
    const decoded: unknown = JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
    expect(decoded).toEqual({ username: 'ci', password: 's3cret', serveraddress: 'registry.example.com' })
  })

  it('Should_OmitAbsentFields_When_EncodingRegistryAuth', () => {
    const header = encodeRegistryAuth({ serveraddress: 'registry.example.com' })
    const decoded: unknown = JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
    expect(decoded).toEqual({ serveraddress: 'registry.example.com' })
  })

  it('Should_DecodeRegistryAuth_When_TheHeaderPayloadIsWellFormed', () => {
    const result = decodeJsonBody(RegistryAuthConfig, 'registryAuth')(
      JSON.stringify({ username: 'ci', auth: 'Y2k6czN', serveraddress: 'registry.example.com' }),
    )
    expect(unwrap(result)).toEqual({ username: 'ci', auth: 'Y2k6czN', serveraddress: 'registry.example.com' })
  })
})

describe('network', () => {
  it('Should_DecodeNetworkCreateResponse_When_TheIdIsPresent', () => {
    const result = decodeJsonBody(NetworkCreateResponse, 'networkCreate')(
      JSON.stringify({ Id: 'net123', Warning: 'x' }),
    )
    expect(unwrap(result)).toEqual({ Id: 'net123', Warning: 'x' })
  })

  it('Should_EncodeNetworkConnectRequest_When_AliasesAreDeclared', () => {
    const encoded = S.encodeSync(NetworkConnectRequest)({ Container: 'c42', EndpointConfig: { Aliases: ['redis'] } })
    expect(encoded).toEqual({ Container: 'c42', EndpointConfig: { Aliases: ['redis'] } })
  })

  it('Should_EncodeNetworkCreateRequest_When_OnlyTheNameIsPresent', () => {
    expect(S.encodeSync(NetworkCreateRequest)({ Name: 'rz-net' })).toEqual({ Name: 'rz-net' })
  })
})

describe('logs query', () => {
  it('Should_EncodeTheBoundedSnapshot_When_TailingFromTheEnd', () => {
    const query = unwrap(S.decodeResult(LogsQuery)({ stdout: true, stderr: true, follow: false, tail: 1000 }))
    expect(encodeLogsQuery(query)).toBe('stdout=1&stderr=1&tail=1000')
  })

  it('Should_EncodeTheFollowShape_When_StreamingAllLines', () => {
    const query = unwrap(S.decodeResult(LogsQuery)({ stdout: true, stderr: true, follow: true, tail: 'all' }))
    expect(encodeLogsQuery(query)).toBe('follow=1&stdout=1&stderr=1&tail=all')
  })
})
