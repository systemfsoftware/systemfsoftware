import { NodeCommandExecutor, NodeFileSystem } from '@effect/platform-node'
import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import { HookScopeLive } from '../src/hook-runtime.state.js'
import { collectSettingsGapsWithPaths } from '../src/internal/collect-settings-gaps.executor.js'
import { makeSettingsJson } from './hook-dispatcher-fixture.observer.js'

const Feature = makeFeature({ it, layer })

const testLayer = HookScopeLive.pipe(
  Layer.provideMerge(
    NodeCommandExecutor.layer.pipe(
      Layer.provideMerge(NodeFileSystem.layer),
      Layer.provideMerge(PathModule.layer),
    ),
  ),
)

/** Derived via the shell — the executor owns a private copy that the test cannot reach. */
type Coverage = Effect.Effect.Success<ReturnType<typeof collectSettingsGapsWithPaths>>['coverage']

const coverageReportLines = (coverage: Coverage): readonly string[] => [
  ...coverage.unrecognized.map((row) => `  ${row.event}: ${row.reason}`),
  ...coverage.notCarried.map((row) => `  ${row.event}: not carried by this bridge — ${row.reason}`),
  ...coverage.matcherNotEvaluable.map(
    (row) => `  ${row.event}: hook skipped, matcher not evaluable — ${row.reason}`,
  ),
  ...coverage.matcherOutOfReach.map((row) => `  ${row.event}: ${row.reason}`),
  ...coverage.shadowed.map((row) => `  ${row.event}: ${row.reason}`),
  ...coverage.disabled.map((row) => `  ${row.event}: ${row.reason}`),
]

Feature('Hook coverage reported at session start')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    const reportFor = (dir: string) =>
      Effect.map(
        collectSettingsGapsWithPaths([`${dir}/.claude/settings.json`]),
        (gaps) => coverageReportLines(gaps.coverage).join('\n'),
      )

    scenario(
      'Should stay silent when every configured event is bridged with a readable matcher',
      Gherkin.Do.pipe(
        Given('a settings file hooking only PreToolUse and PostToolUse')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* makeSettingsJson(dir, { PreToolUse: [], PostToolUse: [] })
            return dir
          })),
        When('the session starts')('report', (s) => reportFor(s.dir)),
        Then('nothing is reported')((s) =>
          Effect.sync(() => {
            expect(s.report).toBe('')
          })
        ),
      ),
    )

    scenario(
      'Should leave a PreCompact hook that declares no matcher unmentioned',
      Gherkin.Do.pipe(
        Given('a settings file hooking PreCompact with no matcher')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* makeSettingsJson(dir, { PreCompact: [{ hooks: [{ type: 'command', command: 'true' }] }] })
            return dir
          })),
        When('the session starts')('report', (s) => reportFor(s.dir)),
        Then('PreCompact goes unmentioned because that hook will run')((s) =>
          Effect.sync(() => {
            expect(s.report).toBe('')
          })
        ),
      ),
    )

    scenario(
      'Should carry all three coverage classes in a single report',
      Gherkin.Do.pipe(
        Given('a settings file hooking NotAnEvent, UserPromptExpansion and a matched PreCompact')(
          'dir',
          (_s) =>
            Effect.gen(function*() {
              const fs = yield* FileSystem
              const dir = yield* fs.makeTempDirectoryScoped()
              yield* makeSettingsJson(dir, {
                NotAnEvent: [{ hooks: [{ type: 'command', command: 'true' }] }],
                UserPromptExpansion: [{ hooks: [{ type: 'command', command: 'true' }] }],
                PreCompact: [{ matcher: 'manual', hooks: [{ type: 'command', command: 'true' }] }],
              })
              return dir
            }),
        ),
        When('the session starts')('report', (s) => reportFor(s.dir)),
        Then('one report carries a line for each of the three classes')((s) =>
          Effect.sync(() => {
            expect(s.report.split('\n')).toHaveLength(3)
            expect(s.report).toContain(`NotAnEvent: not in this bridge's catalog`)
            expect(s.report).toContain('UserPromptExpansion: not carried by this bridge')
            expect(s.report).toContain('PreCompact: hook skipped, matcher not evaluable')
          })
        ),
      ),
    )

    scenario(
      'Should report a flat settings file without mistaking disableAllHooks for an event',
      Gherkin.Do.pipe(
        Given('a flat settings file carrying disableAllHooks beside UserPromptExpansion')(
          'dir',
          (_s) =>
            Effect.gen(function*() {
              const fs = yield* FileSystem
              const dir = yield* fs.makeTempDirectoryScoped()
              yield* fs.makeDirectory(`${dir}/.claude`, { recursive: true })
              yield* fs.writeFileString(
                `${dir}/.claude/settings.json`,
                JSON.stringify({
                  PreToolUse: [],
                  disableAllHooks: false,
                  UserPromptExpansion: [{ hooks: [{ type: 'command', command: 'true' }] }],
                }),
              )
              return dir
            }),
        ),
        When('the session starts')('report', (s) => reportFor(s.dir)),
        Then('only UserPromptExpansion is named')((s) =>
          Effect.sync(() => {
            expect(s.report.split('\n')).toHaveLength(1)
            expect(s.report).toContain('UserPromptExpansion: not carried by this bridge')
          })
        ),
      ),
    )

    scenario(
      'Should name a hook that another settings file switched off',
      Gherkin.Do.pipe(
        Given('a user file guarding PreToolUse and a project file setting disableAllHooks')(
          'dirs',
          (_s) =>
            Effect.gen(function*() {
              const fs = yield* FileSystem
              const user = yield* fs.makeTempDirectoryScoped()
              const project = yield* fs.makeTempDirectoryScoped()
              yield* makeSettingsJson(user, {
                PreToolUse: [{ hooks: [{ type: 'command', command: 'true' }] }],
              })
              yield* fs.makeDirectory(`${project}/.claude`, { recursive: true })
              yield* fs.writeFileString(
                `${project}/.claude/settings.json`,
                JSON.stringify({ hooks: {}, disableAllHooks: true }),
              )
              return { project, user }
            }),
        ),
        When('the session starts')('report', (s) =>
          Effect.map(
            collectSettingsGapsWithPaths([
              `${s.dirs.user}/.claude/settings.json`,
              `${s.dirs.project}/.claude/settings.json`,
            ]),
            (gaps) => coverageReportLines(gaps.coverage).join('\n'),
          )),
        Then('the report names PreToolUse and the file that switched it off')((s) =>
          Effect.sync(() => {
            expect(s.report).toContain('PreToolUse: switched off by `disableAllHooks`')
            expect(s.report).toContain(`${s.dirs.project}/.claude/settings.json`)
          })
        ),
      ),
    )

    scenario(
      'Should name a hook group the wrapper shape hides',
      Gherkin.Do.pipe(
        Given('a settings file wrapping PreToolUse and repeating PostToolUse at the top level')(
          'dir',
          (_s) =>
            Effect.gen(function*() {
              const fs = yield* FileSystem
              const dir = yield* fs.makeTempDirectoryScoped()
              yield* fs.makeDirectory(`${dir}/.claude`, { recursive: true })
              yield* fs.writeFileString(
                `${dir}/.claude/settings.json`,
                JSON.stringify({
                  hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'true' }] }] },
                  PostToolUse: [{ hooks: [{ type: 'command', command: 'true' }] }],
                }),
              )
              return dir
            }),
        ),
        When('the session starts')('report', (s) => reportFor(s.dir)),
        Then('the report names PostToolUse as never read')((s) =>
          Effect.sync(() => {
            expect(s.report).toContain('PostToolUse: ignored: this file wraps its hooks')
            expect(s.report).not.toContain('PreToolUse')
          })
        ),
      ),
    )

    scenario(
      'Should strip an escape sequence a settings key smuggles into the report',
      Gherkin.Do.pipe(
        Given('a settings file whose event key carries an escape and a newline')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* makeSettingsJson(dir, {
              PreToolUse: [],
              '\u001B[2J\nAudit: PASSED': [{ hooks: [{ type: 'command', command: 'true' }] }],
            })
            return dir
          })),
        When('the session starts')('report', (s) => reportFor(s.dir)),
        Then('the report is one line carrying no control character')((s) =>
          Effect.sync(() => {
            expect(s.report.split('\n')).toHaveLength(1)
            expect(s.report).not.toContain('\u001B')
          })
        ),
      ),
    )
  })
