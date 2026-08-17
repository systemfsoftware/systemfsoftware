/**
 * Wire-declaration refusal tests.
 *
 * The acceptance half lives in `wire.kernel.test.ts`; this file states what a
 * wire declaration REJECTS — the loud-failure contract (KTD6): a decode
 * failure is a tagged {@link WireDecodeError}, never a silent default. The
 * inputs are fixed malformed fixtures: the daemon's drift surface is a small
 * set of wrong shapes, not an open value space, so a constant pool is the
 * honest input space (per-case cost bounded by the draw).
 *
 * Tenant: every predicate is a pure boolean — no `expect` inside it.
 */
import { it } from '@effect/vitest'
import * as Result from 'effect/Result'
import { FastCheck as fc } from 'effect/testing'
import { describe } from 'vitest'
import { ContainerCreateResponse, ContainerInspectResponse } from '../container.js'
import { decodeJsonBody, WireDecodeError } from '../decode.js'
import { ExecInspectResponse } from '../exec.js'
import { ImagePullProgressFrame } from '../image.js'

const rejected = <A>(result: Result.Result<A, WireDecodeError>): boolean =>
  Result.isFailure(result) && result.failure._tag === 'WireDecodeError'

const rejectsBody =
  <A, I>(schema: Parameters<typeof decodeJsonBody<A, I>>[0], identifier: string) => (body: string): boolean =>
    rejected(decodeJsonBody(schema, identifier)(body))

describe('container create response refusals', () => {
  it.prop(
    '∀b_ContainerCreateResponse_⊥OnMalformedId',
    [fc.constantFrom('{"Id":42}', '{"Warnings":[]}', '42', '[{"Id":"abc"}]', '{"id":"lowercase"}')],
    ([body]) => rejectsBody(ContainerCreateResponse, 'containerCreate')(body),
  )
})

describe('exec inspect refusals', () => {
  it.prop(
    '∀b_ExecInspect_⊥OnMissingExitCode',
    // The exit code is a verdict; a body without it must fail loudly — this
    // is the anti-regression for upstream's `extractNumber(...) ?? -1`.
    [fc.constantFrom('{"Running":false,"Pid":0}', '{"Running":true}', '{}')],
    ([body]) => rejectsBody(ExecInspectResponse, 'execInspect')(body),
  )
})

describe('container inspect refusals', () => {
  const state = {
    Status: 'running',
    Running: true,
    Paused: false,
    Restarting: false,
    OOMKilled: false,
    Dead: false,
    Pid: 1,
    ExitCode: 0,
    Error: '',
    StartedAt: 'x',
    FinishedAt: 'y',
  }
  const base = {
    Id: 'abc123',
    Name: '/n',
    State: state,
    NetworkSettings: { Ports: {} },
  }

  it.prop(
    '∀b_ContainerInspect_⊥onMalformedState',
    [
      fc.constantFrom(
        JSON.stringify({ ...base, State: { ...state, Status: 42 } }),
        JSON.stringify({ ...base, State: { ...state, Health: { Status: 'undefined' } } }),
        // State absent entirely — a partial daemon response.
        JSON.stringify({ Id: 'abc123', Name: '/n' }),
        JSON.stringify({ ...base, NetworkSettings: { Ports: { '6379/tcp': [{}] } } }),
      ),
    ],
    ([body]) => rejectsBody(ContainerInspectResponse, 'containerInspect')(body),
  )
})

describe('image pull refusals', () => {
  it.prop(
    '∀b_ImagePullProgress_⊥onNonJsonLine',
    [fc.constantFrom('not json', '<!DOCTYPE html>', '', '42')],
    ([body]) => rejectsBody(ImagePullProgressFrame, 'imagePull')(body),
  )
})
