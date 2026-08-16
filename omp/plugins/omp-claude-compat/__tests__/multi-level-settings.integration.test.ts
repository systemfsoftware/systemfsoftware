import * as NodeChildProcessSpawner from '@effect/platform-node-shared/NodeChildProcessSpawner'
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import * as PathModule from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import { expect } from 'vitest'
import { loadSettingsWithPaths } from '../src/internal/load-settings.executor.js'
import { expectLoaded } from './loaded.observer.js'

const Feature = makeFeature({ it, layer })

const testLayer = NodeChildProcessSpawner.layer.pipe(
  Layer.provideMerge(NodeFileSystem.layer),
  Layer.provideMerge(PathModule.layer),
)

function writeSettingsFile(
  dir: string,
  filename: string,
  hooks: Record<string, unknown>,
): Effect.Effect<void, PlatformError, FileSystem> {
  return Effect.gen(function*() {
    const fs = yield* FileSystem
    yield* fs.makeDirectory(`${dir}/.claude`, { recursive: true })
    yield* fs.writeFileString(`${dir}/.claude/${filename}`, JSON.stringify({ hooks }, null, 2))
  })
}

Feature('Multi-level hook settings loading')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    scenario(
      'Hooks from user and project scope concatenate',
      Gherkin.Do.pipe(
        Given('a base directory')('base', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            return yield* fs.makeTempDirectoryScoped()
          })),
        Given('settings exist in user scope and project scope')('paths', (s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const userDir = `${s.base}/user`
            const projectDir = `${s.base}/project`
            yield* fs.makeDirectory(userDir, { recursive: true })
            yield* fs.makeDirectory(projectDir, { recursive: true })
            yield* writeSettingsFile(userDir, 'settings.json', {
              PreToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command: '/user-hook.sh' }] }],
            })
            yield* writeSettingsFile(projectDir, 'settings.json', {
              PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: '/project-hook.sh' }] }],
            })
            return [
              `${userDir}/.claude/settings.json`,
              `${projectDir}/.claude/settings.json`,
            ]
          })),
        When('loadSettingsWithPaths is called with those paths')('result', (s) => loadSettingsWithPaths(s.paths)),
        Then('the merged settings should contain two PreToolUse hooks')((s) =>
          Effect.sync(() => {
            expect(s.result).not.toBeNull()
            expect(expectLoaded(s.result).hooks.PreToolUse).toHaveLength(2)
          })
        ),
      ),
    )

    scenario(
      'disableAllHooks drops the hooks it is allowed to disable',
      Gherkin.Do.pipe(
        Given('a base directory')('base', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            return yield* fs.makeTempDirectoryScoped()
          })),
        Given('project scope defines a hook and local scope disables all')('paths', (s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const projectDir = `${s.base}/project`
            const localDir = `${s.base}/local`
            yield* fs.makeDirectory(projectDir, { recursive: true })
            yield* fs.makeDirectory(localDir, { recursive: true })
            yield* writeSettingsFile(projectDir, 'settings.json', {
              PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: '/hook.sh' }] }],
            })
            yield* fs.makeDirectory(`${localDir}/.claude`, { recursive: true })
            yield* fs.writeFileString(
              `${localDir}/.claude/settings.local.json`,
              JSON.stringify({ hooks: {}, disableAllHooks: true }),
            )
            return [
              `${projectDir}/.claude/settings.json`,
              `${localDir}/.claude/settings.local.json`,
            ]
          })),
        When('loadSettingsWithPaths is called')('result', (s) => loadSettingsWithPaths(s.paths)),
        Then('no hook survives')((s) =>
          Effect.sync(() => {
            expect(s.result).not.toBeNull()
            expect(expectLoaded(s.result).hooks.PreToolUse).toEqual([])
          })
        ),
      ),
    )

    scenario(
      'A managed hook survives disableAllHooks set outside managed settings',
      Gherkin.Do.pipe(
        Given('a base directory')('base', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            return yield* fs.makeTempDirectoryScoped()
          })),
        Given('managed policy defines a hook and the user disables all')('paths', (s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const userDir = `${s.base}/user`
            yield* fs.makeDirectory(`${userDir}/.claude`, { recursive: true })
            yield* fs.writeFileString(
              `${userDir}/.claude/settings.json`,
              JSON.stringify({
                hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: '/user.sh' }] }] },
                disableAllHooks: true,
              }),
            )
            yield* fs.writeFileString(
              `${s.base}/managed-settings.json`,
              JSON.stringify({
                hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: '/policy.sh' }] }] },
              }),
            )
            return [`${userDir}/.claude/settings.json`, `${s.base}/managed-settings.json`]
          })),
        When('loadSettingsWithPaths is called')(
          'result',
          (s) => loadSettingsWithPaths(s.paths, s.paths[1]),
        ),
        Then('only the managed hook runs')((s) =>
          Effect.sync(() => {
            expect(s.result).not.toBeNull()
            const commands = expectLoaded(s.result).hooks.PreToolUse
              .flatMap((e) => e.hooks)
              .filter((h) => h.type === 'command')
              .map((h) => h.command)
            expect(commands).toEqual(['/policy.sh'])
          })
        ),
      ),
    )

    scenario(
      'disableAllHooks in managed settings turns everything off',
      Gherkin.Do.pipe(
        Given('a base directory')('base', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            return yield* fs.makeTempDirectoryScoped()
          })),
        Given('managed policy disables all hooks')('paths', (s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const userDir = `${s.base}/user`
            yield* fs.makeDirectory(`${userDir}/.claude`, { recursive: true })
            yield* fs.writeFileString(
              `${userDir}/.claude/settings.json`,
              JSON.stringify({
                hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: '/user.sh' }] }] },
              }),
            )
            yield* fs.writeFileString(
              `${s.base}/managed-settings.json`,
              JSON.stringify({ hooks: {}, disableAllHooks: true }),
            )
            return [`${userDir}/.claude/settings.json`, `${s.base}/managed-settings.json`]
          })),
        When('loadSettingsWithPaths is called')(
          'result',
          (s) => loadSettingsWithPaths(s.paths, s.paths[1]),
        ),
        Then('no hook survives')((s) =>
          Effect.sync(() => {
            expect(s.result).not.toBeNull()
            expect(expectLoaded(s.result).hooks.PreToolUse).toEqual([])
          })
        ),
      ),
    )

    scenario(
      'Missing settings files are silently skipped',
      Gherkin.Do.pipe(
        Given('a directory with a settings file')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* writeSettingsFile(dir, 'settings.json', {
              PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: '/hook.sh' }] }],
            })
            return dir
          })),
        When('loadSettingsWithPaths is called with an existing and a missing path')(
          'result',
          (s) =>
            loadSettingsWithPaths([
              `${s.dir}/.claude/settings.json`,
              `${s.dir}/.claude/settings.local.json`,
            ]),
        ),
        Then('the result should contain hooks from the existing file')((s) =>
          Effect.sync(() => {
            expect(s.result).not.toBeNull()
            expect(expectLoaded(s.result).hooks.PreToolUse).toHaveLength(1)
          })
        ),
      ),
    )

    scenario(
      'Invalid JSON in one file does not prevent loading the other',
      Gherkin.Do.pipe(
        Given('a directory with two settings files, one invalid')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* fs.makeDirectory(`${dir}/.claude`, { recursive: true })
            yield* fs.writeFileString(`${dir}/.claude/bad.json`, 'not valid json')
            yield* fs.writeFileString(
              `${dir}/.claude/good.json`,
              JSON.stringify({
                hooks: {
                  PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: '/hook.sh' }] }],
                },
              }),
            )
            return dir
          })),
        When('loadSettingsWithPaths is called with both paths')(
          'result',
          (s) => loadSettingsWithPaths([`${s.dir}/.claude/bad.json`, `${s.dir}/.claude/good.json`]),
        ),
        Then('the result should have hooks from the valid file')((s) =>
          Effect.sync(() => {
            expect(s.result).not.toBeNull()
            expect(expectLoaded(s.result).hooks.PreToolUse).toHaveLength(1)
          })
        ),
      ),
    )
  })
