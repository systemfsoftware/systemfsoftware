import * as BunContext from '@effect/platform-bun/BunContext'
import * as BunRuntime from '@effect/platform-bun/BunRuntime'
import * as Path from '@effect/platform/Path'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as Either from 'effect/Either'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import { layer as lintGuardAdapterLayer } from './lint-guard.adapter.js'
import { LintGuardAdapter, runLintGuard } from './lint-guard.executor.js'

const importMeta: ImportMeta & { readonly main?: boolean } = import.meta

// A hook payload larger than 1 MiB is not a legitimate edit payload; capping
// stdin is defense in depth so a runaway pipe cannot exhaust the process.
const STDIN_CAP_BYTES = 1024 * 1024

const readStdin: Effect.Effect<Either.Either<string, 'too-large'>, never> = Effect.async((resume) => {
  process.stdin.setEncoding('utf-8')
  let data = ''
  const finish = (result: Either.Either<string, 'too-large'>): void => {
    cleanup()
    resume(Effect.succeed(result))
  }
  const onData = (chunk: string): void => {
    if (data.length + chunk.length > STDIN_CAP_BYTES) {
      finish(Either.left('too-large'))
      return
    }
    data += chunk
  }
  const onEnd = (): void => {
    finish(Either.right(data))
  }
  const onError = (error: Error): void => {
    cleanup()
    resume(Effect.die(error))
  }
  const cleanup = (): void => {
    process.stdin.off('data', onData)
    process.stdin.off('end', onEnd)
    process.stdin.off('error', onError)
  }
  process.stdin.on('data', onData)
  process.stdin.on('end', onEnd)
  process.stdin.on('error', onError)
  return Effect.sync(cleanup)
})

const program: Effect.Effect<number, never, LintGuardAdapter | Path.Path> = Effect.gen(function*() {
  const stdin = yield* readStdin
  // A payload this guard cannot read is a skip, exactly like stdin that is not a hook payload.
  // This hook is PostToolUse: the write has already landed, so there is nothing left to veto and
  // exit 2 would only hand the agent a message it cannot act on. The PreToolUse config guard,
  // which can still veto, fails closed on the same overflow.
  if (Either.isLeft(stdin)) {
    return 0
  }
  const result = yield* runLintGuard(stdin.right)
  if (result.stderr !== '') {
    yield* Console.error(result.stderr)
  }
  return result.exitCode
})

const isExitCode = (value: unknown): value is number => typeof value === 'number'

const runnable = Effect.provide(
  program,
  Layer.merge(
    Layer.provide(lintGuardAdapterLayer, BunContext.layer),
    BunContext.layer,
  ),
)

if (importMeta.main) {
  BunRuntime.runMain({
    disableErrorReporting: true,
    disablePrettyLogger: true,
    teardown: (exit, onExit) => onExit(Exit.isSuccess(exit) && isExitCode(exit.value) ? exit.value : 1),
  })(runnable)
}
