/**
 * Rejection properties for the container-spec module's shared refinements —
 * `CommandArguments` (a command line is at least one argument) and
 * `FiniteNumber` (NaN and infinities are never meaningful domain values, and
 * a JSON codec that admitted them would emit `null` on the wire).
 *
 * These `refutes` calls discharge the shared refinement-obligation nodes for
 * every schema that embeds them (`ContainerSpec.command`/`.entrypoint`,
 * `ExecRequest.command`, the MB ceilings, `ExecResult.exitCode`, the
 * `TmpfsRootExceedsMemoryError` fields), keeping the generated law suite's
 * obligation test green.
 */
import { refutes } from '@systemfsoftware/effect-schema-law'
import { FastCheck as fc } from 'effect/testing'
import { CommandArguments, ContainerSpec, ExecRequest, FiniteNumber } from '../container-spec.js'

refutes(FiniteNumber, {
  NaN: fc.constant(Number.NaN),
  PositiveInfinity: fc.constant(Number.POSITIVE_INFINITY),
  NegativeInfinity: fc.constant(Number.NEGATIVE_INFINITY),
})

refutes(CommandArguments, {
  EmptyCommand: fc.constant([]),
})

/**
 * Container schemas carry their own copies of every embedded obligation
 * node, so the refusals are restated against the containers themselves for
 * the generated law suite's coverage test.
 */
refutes(ExecRequest, {
  EmptyCommand: fc.constant({ command: [], env: [] }),
})

const specWith = (patch: object): object => ({
  name: 'rz-test-01',
  image: 'alpine:3.19',
  env: [],
  ports: [],
  mounts: [],
  aliases: [],
  runId: 'deadbeef',
  keepAlive: false,
  networkDisabled: false,
  requireIsolation: false,
  waitStrategy: { _tag: 'ForPort' },
  ...patch,
})

refutes(ContainerSpec, {
  ZeroGuestPort: fc.constant(specWith({ ports: [{ hostPort: 0, guestPort: 0 }] })),
  NegativeGuestPort: fc.constant(specWith({ ports: [{ hostPort: 0, guestPort: -1 }] })),
  OverflowGuestPort: fc.constant(specWith({ ports: [{ hostPort: 0, guestPort: 65_536 }] })),
  NegativeHostPort: fc.constant(specWith({ ports: [{ hostPort: -1, guestPort: 8080 }] })),
  OverflowHostPort: fc.constant(specWith({ ports: [{ hostPort: 65_536, guestPort: 8080 }] })),
  BadAlias: fc.constant(specWith({ aliases: ['x:y'] })),
  EmptyCommand: fc.constant(specWith({ command: [] })),
  InfiniteTmpfsRootMb: fc.constant(specWith({ tmpfsRootMb: Number.POSITIVE_INFINITY })),
})
