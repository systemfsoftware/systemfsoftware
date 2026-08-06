import * as BunContext from '@effect/platform-bun/BunContext'
import * as BunRuntime from '@effect/platform-bun/BunRuntime'
import * as FileSystem from '@effect/platform/FileSystem'
import type { Teardown } from '@effect/platform/Runtime'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as Either from 'effect/Either'
import * as Exit from 'effect/Exit'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import type { EditCommand } from '../edit-command.schema.js'
import { HookPayloadToEditCommand } from '../hook-payload.acl.js'
import { ExtractionCommand } from './extraction-command.schema.js'
import { extractPairs } from './extraction.workflow.js'
import { DecideCommand } from './verdict-command.schema.js'
import { type CannotVerify, decide, type Verdict } from './verdict.workflow.js'

const decodeEdit = S.decodeUnknownEither(S.parseJson(HookPayloadToEditCommand))

// `file_path` arrives relative to the hook's process cwd. Resolve it against
// cwd exactly once (absolute inputs pass through untouched); joining it onto a
// base that already contains it was the old implementation's double-join bug.
const resolveAgainstCwd = (cwd: string, filePath: string): string =>
  filePath.startsWith('/') ? filePath : `${cwd.replace(/\/$/, '')}/${filePath}`

const STDIN_CAP_BYTES = 1024 * 1024

const readStdin = (): Promise<Either.Either<string, 'too-large'>> => {
  const { promise, resolve, reject } = Promise.withResolvers<Either.Either<string, 'too-large'>>()
  let data = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk: string) => {
    if (data.length + chunk.length > STDIN_CAP_BYTES) {
      resolve(Either.left('too-large'))
      return
    }
    data += chunk
  })
  process.stdin.on('end', () => resolve(Either.right(data)))
  process.stdin.on('error', reject)
  return promise
}

// The on-disk file is the pre-edit state for every edit tool: Write/Create use
// it as the old side, and the hunk tools (Edit/MultiEdit/Update/morph) rebuild
// the whole edited document from it. A file that is absent OR unreadable yields
// Option.none() — indistinguishable by design, so an unreadable target is
// treated exactly like a new file instead of as an empty string that would
// fail JSON parsing or look like every off-rule was newly added.
const readOldSide = (
  command: EditCommand,
  cwd: string,
): Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const target = resolveAgainstCwd(cwd, command.filePath)
    const present = yield* fs.exists(target).pipe(
      Effect.catchAll(() => Effect.succeed(false)),
    )
    if (!present) {
      return Option.none()
    }
    return yield* fs.readFileString(target).pipe(
      Effect.map(Option.some),
      Effect.catchAll(() => Effect.succeed(Option.none())),
    )
  })

export const blockMessage = (verdict: Extract<Verdict, { readonly _tag: 'Block' }>): string =>
  `Blocked: this edit disables the oxlint rule(s) ${verdict.rules.join(', ')} in an oxlint config. ` +
  'Fix the underlying violation instead of disabling the rule.'

export const cannotVerifyMessage = (reason: string): string =>
  `Blocked: cannot verify this edit to an oxlint config file (${reason}). ` +
  'Re-express the change as Edit, Write, or MultiEdit so the before/after content can be checked.'

const render = (outcome: Either.Either<Verdict, CannotVerify>): Effect.Effect<number, never, never> =>
  Either.match(outcome, {
    onLeft: (cannotVerify) => Console.error(cannotVerifyMessage(cannotVerify.reason)).pipe(Effect.as(2)),
    onRight: (verdict) =>
      Match.value(verdict).pipe(
        Match.tag('Block', (blocked) => Console.error(blockMessage(blocked)).pipe(Effect.as(2))),
        Match.tag('Allow', () => Effect.succeed(0)),
        Match.exhaustive,
      ),
  })

export const runGuard = (
  raw: string,
  cwd: string = process.cwd(),
): Effect.Effect<number, never, FileSystem.FileSystem> =>
  Either.match(decodeEdit(raw), {
    onLeft: () => Effect.succeed(0),
    onRight: (command) =>
      Effect.gen(function*() {
        const diskContent = yield* readOldSide(command, cwd)
        const extraction = extractPairs(new ExtractionCommand({ command, diskContent }))
        const outcome = decide(new DecideCommand({ targetPath: command.filePath, extraction }))
        return yield* render(outcome)
      }),
  })

// The program returns the exit code as its success value; the teardown maps it onto
// the process. A defect falls to 1 so a crashing hook never blocks every edit, while
// the guard's fail-closed verdicts (unparseable shapes) return 2 as normal decisions.
const teardown: Teardown = (exit, onExit) => {
  if (Exit.isSuccess(exit)) {
    const value = exit.value
    onExit(typeof value === 'number' ? value : 1)
  } else {
    onExit(1)
  }
}

export const oversizeMessage =
  'Blocked: cannot verify this edit to an oxlint config file (the hook payload exceeded the 1 MiB input cap).'

if (import.meta.main) {
  BunRuntime.runMain(
    Effect.promise(readStdin).pipe(
      Effect.flatMap(Either.match({
        onLeft: () => Console.error(oversizeMessage).pipe(Effect.as(2)),
        onRight: (raw: string) => runGuard(raw),
      })),
      Effect.provide(BunContext.layer),
    ),
    { disableErrorReporting: true, disablePrettyLogger: true, teardown },
  )
}
