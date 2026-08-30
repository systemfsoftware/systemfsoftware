import { DenoRuntime, DenoServices } from '@effect/platform-deno'
import { Cell } from '@systemfsoftware/effect-cell-types'
import { Console, Effect, Option, Schema as S, Stream } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import { Path } from 'effect/Path'
import { Stdio } from 'effect/Stdio'
import { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner'
import { STDIN_CAP_BYTES } from './constants.ts'
import { LintFailure } from './flow.schema.ts'
import { decodeBytes, makeGuardAdapters } from './guard.adapter.ts'
import { buildGuardCell, GuardWire, WirePayload } from './guard.workflow.ts'

const program = Effect.gen(function*() {
  const stdio = yield* Stdio
  const args = yield* stdio.args
  const cwd = args[0] ?? '.'
  let rootOverride: string | undefined
  if (args.length > 1 && args[1] !== '') {
    rootOverride = args[1]
  }

  const chunks = yield* Stream.runCollect(
    stdio.stdin.pipe(Stream.take(STDIN_CAP_BYTES + 1)),
  )
  const stdinSize = chunks.reduce(
    (total, chunk) => total + chunk.byteLength,
    0,
  )
  if (stdinSize > STDIN_CAP_BYTES) {
    return
  }
  const text = decodeBytes(chunks)
  const payload = yield* S.decodeUnknownEffect(S.fromJsonString(WirePayload))(text).pipe(
    Effect.option,
  )
  if (Option.isNone(payload)) {
    return
  }

  const fs = yield* FileSystem
  const path = yield* Path
  const spawner = yield* ChildProcessSpawner

  const adapters = makeGuardAdapters({ fs, path, spawner, cwd, rootOverride })
  const result = yield* Cell.apply(
    buildGuardCell(adapters),
    new GuardWire({
      toolName: payload.value.tool_name,
      filePath: payload.value.tool_input.file_path,
    }),
  )

  if (result.stderr !== '') {
    yield* Console.error(result.stderr)
  }
  if (result.exitCode !== 0) {
    return yield* Effect.fail(
      new LintFailure({ exitCode: result.exitCode, message: result.stderr }),
    )
  }
}).pipe(Effect.provide(DenoServices.layer))

DenoRuntime.runMain(program)
