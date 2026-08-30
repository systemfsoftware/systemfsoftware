import { DenoRuntime, DenoServices } from '@effect/platform-deno'
import { Cell } from '@systemfsoftware/effect-cell-types'
import { Console, Effect, Schema as S, Stream } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import { Path } from 'effect/Path'
import { Stdio } from 'effect/Stdio'
import { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner'
import { STDIN_CAP_BYTES } from './constants.ts'
import { LintFailure } from './flow.schema.ts'
import { makeGuardAdapters } from './guard.adapter.ts'
import { buildGuardCell, GuardWire, WirePayload } from './guard.workflow.ts'

const concatBytes = (chunks: Iterable<Uint8Array>): Uint8Array => {
  const list = Array.from(chunks)
  let total = 0
  for (const chunk of list) {
    total += chunk.byteLength
  }
  const all = new Uint8Array(total)
  let offset = 0
  for (const chunk of list) {
    all.set(chunk, offset)
    offset += chunk.byteLength
  }
  return all
}

const parseJson = (text: string): unknown => JSON.parse(text)

const program = Effect.gen(function*() {
  const stdio = yield* Stdio
  const args = yield* stdio.args
  const cwd = args[0] ?? '.'
  let rootOverride: string | undefined
  if (args.length > 1 && args[1] !== '') {
    rootOverride = args[1]
  }

  const bytes = yield* Stream.runCollect(stdio.stdin.pipe(Stream.take(STDIN_CAP_BYTES + 1)))
  let stdinSize = 0
  for (const chunk of bytes) {
    stdinSize += chunk.byteLength
  }
  if (stdinSize > STDIN_CAP_BYTES) {
    return
  }
  const text = new TextDecoder().decode(concatBytes(bytes))

  const parsed = yield* Effect.try(() => parseJson(text)).pipe(
    Effect.catchEager(() => Effect.succeed(undefined)),
  )
  const decoded = yield* S.decodeUnknownEffect(WirePayload)(parsed).pipe(
    Effect.catchEager(() => Effect.succeed(undefined)),
  )
  if (decoded === undefined) {
    return
  }
  const wire = new GuardWire({ toolName: decoded.tool_name, filePath: decoded.tool_input.file_path })

  const fs = yield* FileSystem
  const path = yield* Path
  const spawner = yield* ChildProcessSpawner

  const adapters = makeGuardAdapters({ fs, path, spawner, cwd, rootOverride })
  const result = yield* Cell.apply(buildGuardCell(adapters), wire)

  if (result.stderr !== '') {
    yield* Console.error(result.stderr)
  }
  if (result.exitCode !== 0) {
    return yield* Effect.fail(new LintFailure({ exitCode: result.exitCode, message: result.stderr }))
  }
}).pipe(Effect.provide(DenoServices.layer))

DenoRuntime.runMain(program)
