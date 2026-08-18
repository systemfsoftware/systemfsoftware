/**
 * Shared fixture for the `Hook dispatcher — ...` integration tests.
 *
 * Sibling of `./loaded.observer.js` (the established pattern for this
 * directory). Observer modules are the sanctioned home for test machinery
 * imported by multiple test files; they must not import shell cells
 * themselves. Helpers here stay operational vocabulary: filesystem writing
 * and reading, no domain types from the executor. Each test file imports the
 * shell directly and wraps the string helpers into the typed objects the
 * shell expects.
 */
import { Effect } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import type { PlatformError } from 'effect/PlatformError'

export function makeShellHookScript(
  dir: string,
  name: string,
  exitCode: number,
  stderr?: string,
  stdout?: string,
): Effect.Effect<string, PlatformError, FileSystem> {
  return Effect.gen(function*() {
    const fs = yield* FileSystem
    const content = [
      '#!/usr/bin/env bash',
      ...(stderr !== undefined && stderr.length > 0 ? [`echo '${stderr}' >&2`] : []),
      ...(stdout !== undefined && stdout.length > 0 ? [`echo '${stdout}'`] : []),
      `exit ${exitCode}`,
    ].join('\n')
    const hookPath = `${dir}/${name}.sh`
    yield* fs.writeFileString(hookPath, content)
    yield* fs.chmod(hookPath, 0o755)
    return hookPath
  })
}

/** Mirrors a real path guard: reads `tool_input.file_path`, no-ops when absent. */
export function makePathGuardScript(
  dir: string,
  name: string,
  forbidden: string,
): Effect.Effect<string, PlatformError, FileSystem> {
  return Effect.gen(function*() {
    const fs = yield* FileSystem
    const content = [
      '#!/usr/bin/env bash',
      'payload=$(cat)',
      `target=$(printf '%s' "$payload" | grep -o '"file_path":"[^"]*"' | head -1)`,
      'if [ -z "$target" ]; then exit 0; fi',
      `if printf '%s' "$target" | grep -q '${forbidden}'; then`,
      '  echo "guard: refused $target" >&2',
      '  exit 2',
      'fi',
      'exit 0',
    ].join('\n')
    const hookPath = `${dir}/${name}.sh`
    yield* fs.writeFileString(hookPath, content)
    yield* fs.chmod(hookPath, 0o755)
    return hookPath
  })
}

export function makeSettingsJson(
  dir: string,
  hooks: Record<string, unknown>,
): Effect.Effect<void, PlatformError, FileSystem> {
  return Effect.gen(function*() {
    const fs = yield* FileSystem
    yield* fs.makeDirectory(`${dir}/.claude`, { recursive: true })
    yield* fs.writeFileString(
      `${dir}/.claude/settings.json`,
      JSON.stringify({ hooks }, null, 2),
    )
  })
}

/**
 * Write a hook that records each invocation, then return a CommandHook
 * shaped value pointing at the script. The structural shape is what the
 * shell takes; the test file passes the result straight to `runHooksForEvent`.
 */
export const makeRecorder = (
  dir: string,
  name: string,
): Effect.Effect<{ type: 'command'; command: string }, never, FileSystem> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem
    const hookPath = `${dir}/${name}.sh`
    yield* fs.writeFileString(
      hookPath,
      ['#!/usr/bin/env bash', `cat > ${dir}/${name}.stdin`, `echo ${name} >> ${dir}/ran.log`, 'exit 0'].join('\n'),
    ).pipe(Effect.orDie)
    yield* fs.chmod(hookPath, 0o755).pipe(Effect.orDie)
    return { type: 'command' as const, command: hookPath }
  })

export const runFileOrEmpty = (path: string): Effect.Effect<string, PlatformError, FileSystem> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem
    return yield* fs.readFileString(path).pipe(Effect.orElseSucceed(() => ''))
  })

export const runInvocations = (dir: string): Effect.Effect<readonly string[], PlatformError, FileSystem> =>
  Effect.map(runFileOrEmpty(`${dir}/ran.log`), (text) => text.split('\n').filter((line) => line !== ''))

/** Write a `claude/settings.json` that wires a path guard on Edit|Write. */
export const makeGuardedSettingsJson = (
  dir: string,
  guardPath: string,
): Effect.Effect<void, PlatformError, FileSystem> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem
    yield* fs.makeDirectory(`${dir}/.claude`, { recursive: true })
    yield* fs.writeFileString(
      `${dir}/.claude/settings.json`,
      JSON.stringify(
        {
          hooks: {
            PreToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: guardPath }] }],
          },
        },
        null,
        2,
      ),
    )
  })
