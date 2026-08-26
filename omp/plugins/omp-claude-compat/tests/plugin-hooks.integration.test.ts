import * as NodeChildProcessSpawner from '@effect/platform-node-shared/NodeChildProcessSpawner'
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import type { ToolResultEvent } from '@oh-my-pi/pi-coding-agent'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import type { HookDispatchResult } from './__fixtures__/HookPublic.js'
import { HookScopeLive, onSessionStart, onToolCall, onToolResult } from './__fixtures__/HookPublic.js'
import type { HookSession } from './__fixtures__/HookPublic.js'

import { Effect, Layer } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import * as PathModule from 'effect/Path'
import { expect } from 'vitest'
import { makeSettingsJson, makeShellHookScript } from './__fixtures__/HookDispatcherFixture.js'

const Feature = makeFeature({ it, layer })

const testLayer = HookScopeLive.pipe(
  Layer.provideMerge(
    NodeChildProcessSpawner.layer.pipe(
      Layer.provideMerge(NodeFileSystem.layer),
      Layer.provideMerge(PathModule.layer),
    ),
  ),
)

const makeCtx = (cwd: string, homeDir: string): HookSession => ({
  cwd,
  homeDir,
  sessionManager: { getSessionId: () => 'test-session' },
  ui: { notify: () => {} },
})

const fileWritten: ToolResultEvent = {
  type: 'tool_result',
  toolName: 'write',
  toolCallId: 'toolu_01ABC',
  input: { path: '/src/checkout.ts', content: '// tally the basket\nexport const total = 1' },
  content: [{ type: 'text', text: 'Wrote 2 lines to /src/checkout.ts' }],
  isError: false,
  details: undefined,
}

const textReachingAgent = (seen: HookDispatchResult): string =>
  seen !== undefined && 'content' in seen
    ? seen.content.map((block) => 'text' in block ? block.text : '').join('\n')
    : ''

const reportedAsFailure = (seen: HookDispatchResult): boolean | undefined =>
  seen !== undefined && 'isError' in seen ? seen.isError : undefined

const writePluginTree = (
  homeDir: string,
  pluginRoot: string,
  hooksJson: string,
) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem
    yield* fs.makeDirectory(`${pluginRoot}/.claude-plugin`, { recursive: true })
    yield* fs.makeDirectory(`${pluginRoot}/hooks`, { recursive: true })
    yield* fs.writeFileString(
      `${pluginRoot}/.claude-plugin/plugin.json`,
      JSON.stringify({ name: 'fixture-plugin' }),
    )
    yield* fs.writeFileString(`${pluginRoot}/hooks/hooks.json`, hooksJson)
    yield* fs.makeDirectory(`${homeDir}/.omp/plugins`, { recursive: true })
    yield* fs.writeFileString(
      `${homeDir}/.omp/plugins/installed_plugins.json`,
      JSON.stringify({
        version: 1,
        plugins: {
          'fixture-plugin@test': [{
            installPath: pluginRoot,
            version: '0.0.0',
            installedAt: '0',
            lastUpdated: '0',
            enabled: true,
          }],
        },
      }),
    )
  })

Feature('Dispatching hooks from an enabled Claude plugin')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    scenario(
      'A plugin PostToolUse hook blocks a write with no project settings file',
      Gherkin.Do.pipe(
        Given('an enabled plugin whose PostToolUse hook rejects the write')('dirs', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const cwd = yield* fs.makeTempDirectoryScoped()
            const homeDir = yield* fs.makeTempDirectoryScoped()
            const pluginRoot = yield* fs.makeTempDirectoryScoped()
            const reviewer = yield* makeShellHookScript(pluginRoot, 'reviewer', 2, 'blocked by plugin')
            yield* writePluginTree(
              homeDir,
              pluginRoot,
              JSON.stringify({
                hooks: {
                  PostToolUse: [{ matcher: 'Write|Edit', hooks: [{ type: 'command', command: reviewer }] }],
                },
              }),
            )
            return { cwd, homeDir }
          })),
        When('the agent writes a file')('seen', (s) => onToolResult(fileWritten, makeCtx(s.dirs.cwd, s.dirs.homeDir))),
        Then('the objection reaches the agent alongside what the tool reported')((s) =>
          Effect.sync(() => {
            expect(textReachingAgent(s.seen)).toContain('Wrote 2 lines to /src/checkout.ts')
            expect(textReachingAgent(s.seen)).toContain('blocked by plugin')
          })
        ),
        Then('the write is still reported as having succeeded')((s) =>
          Effect.sync(() => {
            expect(reportedAsFailure(s.seen)).not.toBe(true)
          })
        ),
      ),
    )

    scenario(
      'A plugin hook child observes CLAUDE_PLUGIN_ROOT',
      Gherkin.Do.pipe(
        Given('an enabled plugin whose hook prints CLAUDE_PLUGIN_ROOT')('dirs', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const cwd = yield* fs.makeTempDirectoryScoped()
            const homeDir = yield* fs.makeTempDirectoryScoped()
            const pluginRoot = yield* fs.makeTempDirectoryScoped()
            const hook = `${pluginRoot}/env.sh`
            yield* fs.writeFileString(
              hook,
              '#!/usr/bin/env bash\necho "$CLAUDE_PLUGIN_ROOT" >&2\nexit 2\n',
            )
            yield* fs.chmod(hook, 0o755)
            yield* writePluginTree(
              homeDir,
              pluginRoot,
              JSON.stringify({
                hooks: { PostToolUse: [{ hooks: [{ type: 'command', command: hook }] }] },
              }),
            )
            return { cwd, homeDir, pluginRoot }
          })),
        When('the agent writes a file')('seen', (s) => onToolResult(fileWritten, makeCtx(s.dirs.cwd, s.dirs.homeDir))),
        Then('stderr from the hook names the plugin root')((s) =>
          Effect.sync(() => {
            expect(textReachingAgent(s.seen)).toContain(s.dirs.pluginRoot)
          })
        ),
      ),
    )

    scenario(
      'Project settings and plugin hooks both run',
      Gherkin.Do.pipe(
        Given('a project hook and a plugin hook that each record a run')('dirs', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const cwd = yield* fs.makeTempDirectoryScoped()
            const homeDir = yield* fs.makeTempDirectoryScoped()
            const pluginRoot = yield* fs.makeTempDirectoryScoped()
            const settingsHook = `${cwd}/settings.sh`
            const pluginHook = `${pluginRoot}/plugin.sh`
            yield* fs.writeFileString(
              settingsHook,
              '#!/usr/bin/env bash\necho settings >> "$OMP_PROJECT_DIR/ran.log"\nexit 0\n',
            )
            yield* fs.writeFileString(
              pluginHook,
              '#!/usr/bin/env bash\necho plugin >> "$OMP_PROJECT_DIR/ran.log"\nexit 0\n',
            )
            yield* fs.chmod(settingsHook, 0o755)
            yield* fs.chmod(pluginHook, 0o755)
            yield* makeSettingsJson(cwd, {
              PostToolUse: [{ hooks: [{ type: 'command', command: settingsHook }] }],
            })
            yield* writePluginTree(
              homeDir,
              pluginRoot,
              JSON.stringify({
                hooks: { PostToolUse: [{ hooks: [{ type: 'command', command: pluginHook }] }] },
              }),
            )
            return { cwd, homeDir }
          })),
        When('the agent writes a file')('seen', (s) => onToolResult(fileWritten, makeCtx(s.dirs.cwd, s.dirs.homeDir))),
        Then('both hooks recorded a run')((s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const log = yield* fs.readFileString(`${s.dirs.cwd}/ran.log`)
            expect(log).toContain('settings')
            expect(log).toContain('plugin')
          })
        ),
      ),
    )

    scenario(
      'A plugin with no hooks file leaves settings-only dispatch unchanged',
      Gherkin.Do.pipe(
        Given('a settings hook and a plugin that has only a manifest')('dirs', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const cwd = yield* fs.makeTempDirectoryScoped()
            const homeDir = yield* fs.makeTempDirectoryScoped()
            const pluginRoot = yield* fs.makeTempDirectoryScoped()
            const settingsHook = yield* makeShellHookScript(cwd, 'settings', 2, 'settings only')
            yield* makeSettingsJson(cwd, {
              PostToolUse: [{ hooks: [{ type: 'command', command: settingsHook }] }],
            })
            yield* fs.makeDirectory(`${pluginRoot}/.claude-plugin`, { recursive: true })
            yield* fs.writeFileString(
              `${pluginRoot}/.claude-plugin/plugin.json`,
              JSON.stringify({ name: 'fixture-plugin' }),
            )
            yield* fs.makeDirectory(`${homeDir}/.omp/plugins`, { recursive: true })
            yield* fs.writeFileString(
              `${homeDir}/.omp/plugins/installed_plugins.json`,
              JSON.stringify({
                version: 1,
                plugins: {
                  'fixture-plugin@test': [{
                    installPath: pluginRoot,
                    version: '0.0.0',
                    installedAt: '0',
                    lastUpdated: '0',
                    enabled: true,
                  }],
                },
              }),
            )
            return { cwd, homeDir }
          })),
        When('the agent writes a file')('seen', (s) => onToolResult(fileWritten, makeCtx(s.dirs.cwd, s.dirs.homeDir))),
        Then('only the settings hook runs')((s) =>
          Effect.sync(() => {
            expect(textReachingAgent(s.seen)).toContain('settings only')
            expect(textReachingAgent(s.seen)).not.toContain('blocked by plugin')
          })
        ),
      ),
    )

    scenario(
      'A plugin PreToolUse hook runs on Write',
      Gherkin.Do.pipe(
        Given('an enabled plugin with a PreToolUse Write matcher')('dirs', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const cwd = yield* fs.makeTempDirectoryScoped()
            const homeDir = yield* fs.makeTempDirectoryScoped()
            const pluginRoot = yield* fs.makeTempDirectoryScoped()
            const guard = yield* makeShellHookScript(pluginRoot, 'pre', 2, 'pre blocked')
            yield* writePluginTree(
              homeDir,
              pluginRoot,
              JSON.stringify({
                hooks: {
                  PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: guard }] }],
                  PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: guard }] }],
                },
              }),
            )
            return { cwd, homeDir }
          })),
        When('the agent is about to write a file')('seen', (s) =>
          onToolCall(
            { toolName: 'write', toolCallId: 'toolu_01ABC', input: { path: '/src/checkout.ts', content: 'x' } },
            makeCtx(s.dirs.cwd, s.dirs.homeDir),
          )),
        Then('the PreToolUse hook blocks the call')((s) =>
          Effect.sync(() => {
            expect(s.seen).toBeDefined()
            expect(JSON.stringify(s.seen)).toContain('pre blocked')
          })
        ),
      ),
    )

    scenario(
      'A plugin SessionStart hook runs without project settings',
      Gherkin.Do.pipe(
        Given('an enabled plugin whose SessionStart hook writes a sentinel')('dirs', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const cwd = yield* fs.makeTempDirectoryScoped()
            const homeDir = yield* fs.makeTempDirectoryScoped()
            const pluginRoot = yield* fs.makeTempDirectoryScoped()
            const hook = `${pluginRoot}/start.sh`
            yield* fs.writeFileString(
              hook,
              '#!/usr/bin/env bash\necho started > "$OMP_PROJECT_DIR/started"\nexit 0\n',
            )
            yield* fs.chmod(hook, 0o755)
            yield* writePluginTree(
              homeDir,
              pluginRoot,
              JSON.stringify({
                hooks: { SessionStart: [{ hooks: [{ type: 'command', command: hook }] }] },
              }),
            )
            return { cwd, homeDir }
          })),
        When('the session starts')('void', (s) => onSessionStart('startup', makeCtx(s.dirs.cwd, s.dirs.homeDir))),
        Then('the sentinel exists')((s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const text = yield* fs.readFileString(`${s.dirs.cwd}/started`)
            expect(text).toContain('started')
          })
        ),
      ),
    )

    scenario(
      'A malformed plugin hooks file does not run and settings still do',
      Gherkin.Do.pipe(
        Given('a settings hook and a plugin with invalid hooks.json')('dirs', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const cwd = yield* fs.makeTempDirectoryScoped()
            const homeDir = yield* fs.makeTempDirectoryScoped()
            const pluginRoot = yield* fs.makeTempDirectoryScoped()
            const settingsHook = yield* makeShellHookScript(cwd, 'settings', 2, 'settings survived')
            yield* makeSettingsJson(cwd, {
              PostToolUse: [{ hooks: [{ type: 'command', command: settingsHook }] }],
            })
            yield* writePluginTree(homeDir, pluginRoot, '{ not json')
            return { cwd, homeDir }
          })),
        When('the agent writes a file')('seen', (s) => onToolResult(fileWritten, makeCtx(s.dirs.cwd, s.dirs.homeDir))),
        Then('only the settings hook runs')((s) =>
          Effect.sync(() => {
            expect(textReachingAgent(s.seen)).toContain('settings survived')
            expect(textReachingAgent(s.seen)).not.toContain('blocked by plugin')
          })
        ),
      ),
    )

    scenario(
      'An args-form plugin command expands CLAUDE_PLUGIN_ROOT',
      Gherkin.Do.pipe(
        Given('an enabled plugin whose hook uses args form')('dirs', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const cwd = yield* fs.makeTempDirectoryScoped()
            const homeDir = yield* fs.makeTempDirectoryScoped()
            const pluginRoot = yield* fs.makeTempDirectoryScoped()
            yield* fs.makeDirectory(`${pluginRoot}/hooks`, { recursive: true })
            const script = `${pluginRoot}/hooks/run.sh`
            yield* fs.writeFileString(
              script,
              '#!/usr/bin/env bash\necho "$1" >&2\nexit 2\n',
            )
            yield* fs.chmod(script, 0o755)
            yield* writePluginTree(
              homeDir,
              pluginRoot,
              JSON.stringify({
                hooks: {
                  PostToolUse: [{
                    hooks: [{
                      type: 'command',
                      command: '/usr/bin/env',
                      args: ['bash', '${CLAUDE_PLUGIN_ROOT}/hooks/run.sh', '${CLAUDE_PLUGIN_ROOT}'],
                    }],
                  }],
                },
              }),
            )
            return { cwd, homeDir, pluginRoot }
          })),
        When('the agent writes a file')('seen', (s) => onToolResult(fileWritten, makeCtx(s.dirs.cwd, s.dirs.homeDir))),
        Then('the child received the expanded plugin root')((s) =>
          Effect.sync(() => {
            expect(textReachingAgent(s.seen)).toContain(s.dirs.pluginRoot)
          })
        ),
      ),
    )
  })
