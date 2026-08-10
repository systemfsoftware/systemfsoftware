import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Contents, layer as memoryFileSystemLayer, type SeedContents } from '@systemfsoftware/effect-memfs'
import { Effect, Layer } from 'effect'
import { afterEach, expect, vi } from 'vitest'
import { runGuard } from '../src/config-guard/main.js'

const Feature = makeFeature({ it, layer })

const payload = (toolName: string, toolInput: Record<string, unknown>): string =>
  JSON.stringify({ tool_name: toolName, tool_input: toolInput })

const runWithFs = (raw: string, contents: SeedContents): Effect.Effect<number, never, never> =>
  runGuard(raw, '/').pipe(
    Effect.provide(memoryFileSystemLayer.pipe(Layer.provide(Layer.succeed(Contents, contents)))),
  )

const stderrText = (calls: readonly unknown[][]): string =>
  calls.map((call: readonly unknown[]) => String(call[0])).join('\n')

const MODULE_CONFIG = 'oxlint.config.ts'
const PRESERVE_OFF_CONTENT = "export default { rules: { 'no-debugger': 'off' } }"
const PRESERVE_JSON = '{"rules":{"no-debugger":"off"}}'
const JSON_DISK_ERROR = '{"rules":{"no-debugger":"error"}}'
const MODULE_DISK_WARN = "export default { rules: { eqeqeq: 'warn' } }"

const EDIT_ADD_OFF = payload('Edit', {
  file_path: MODULE_CONFIG,
  old_string: "rules: { 'no-debugger': 'warn' }",
  new_string: "rules: { 'no-debugger': 'off' }",
})

const EDIT_JSON_ADD_OFF = payload('Edit', {
  file_path: 'oxlint.json',
  old_string: '{"rules":{"no-debugger":"error"}}',
  new_string: '{"rules":{"no-debugger":"off"}}',
})

const EDIT_JSON_BENIGN = payload('Edit', {
  file_path: 'oxlint.json',
  old_string: '"no-debugger":"error"',
  new_string: '"no-debugger":"warn"',
})

const EDIT_JSON_TO_ZERO = payload('Edit', {
  file_path: 'oxlint.json',
  old_string: '"no-debugger":"error"',
  new_string: '"no-debugger":0',
})

const EDIT_JSON_TO_ALLOW = payload('Edit', {
  file_path: 'oxlint.json',
  old_string: '"no-debugger":"error"',
  new_string: '"no-debugger":"allow"',
})

const MULTI_EDIT_ONE_HUNK_OFF = payload('MultiEdit', {
  file_path: MODULE_CONFIG,
  edits: [
    { old_string: "'no-console': 'warn'", new_string: "'no-console': 'error'" },
    { old_string: "'no-debugger': 'warn'", new_string: "'no-debugger': 'off'" },
  ],
})

const MULTI_EDIT_SEQUENTIAL_OFF = payload('MultiEdit', {
  file_path: 'oxlint.json',
  edits: [
    { old_string: '"error"', new_string: '"warn"' },
    { old_string: '"warn"', new_string: '"off"' },
  ],
})

const WRITE_NEW_WITH_OFF = payload('Write', {
  file_path: MODULE_CONFIG,
  content: PRESERVE_OFF_CONTENT,
})

const WRITE_NEW_JSON_WITH_OFF = payload('Write', {
  file_path: 'oxlint.json',
  content: PRESERVE_JSON,
})

const CREATE_NEW_WITH_OFF = payload('Create', {
  file_path: MODULE_CONFIG,
  content: PRESERVE_OFF_CONTENT,
})

const EDIT_JSON_UNPARSEABLE = payload('Edit', {
  file_path: 'oxlint.json',
  old_string: '{"rules":{}}',
  new_string: 'not json at all',
})

const MORPH_RAW = payload('morph_mcp_edit-file', {
  file_path: 'oxlint.json',
  file_edits: [{ find: 'a', replace: 'b' }],
})

const MORPH_FILE_EDITS_OFF = payload('morph_mcp_edit-file', {
  file_path: 'oxlint.json',
  file_edits: [{ find: '"error"', replace: '"off"' }],
})

const WRITE_PRESERVES_OFF = payload('Write', { file_path: MODULE_CONFIG, content: PRESERVE_OFF_CONTENT })

const WRITE_PRESERVES_JSON = payload('Write', { file_path: 'oxlint.json', content: PRESERVE_JSON })

const RELATIVE_WRITE = payload('Write', { file_path: 'src/oxlint.json', content: PRESERVE_JSON })

const EDIT_IGNOREPATTERNS = payload('Edit', {
  file_path: MODULE_CONFIG,
  old_string: "ignorePatterns: ['dist']",
  new_string: "ignorePatterns: ['dist', 'build']",
})

const EDIT_HUNK_ABSENT = payload('Edit', {
  file_path: 'oxlint.json',
  old_string: '"no-restricted-globals": "error"',
  new_string: '"no-restricted-globals": "off"',
})

const OVERRIDES_DISK = '{"rules":{},"overrides":[{"files":["*.ts"],"rules":{"no-debugger":"error"}}]}'

const EDIT_OVERRIDES_OFF = payload('Edit', {
  file_path: 'oxlint.json',
  old_string: '"no-debugger":"error"',
  new_string: '"no-debugger":"off"',
})

const EDIT_MODULE_NONRULE_OFF = payload('Edit', {
  file_path: MODULE_CONFIG,
  old_string: 'export default',
  new_string: "const defaults = { telemetry: 'off' }\nexport default",
})

const EDIT_NON_CONFIG_TARGET = payload('Edit', {
  file_path: 'src/index.ts',
  old_string: 'const x = 1',
  new_string: "rules: { 'no-debugger': 'off' }",
})

const EDIT_CONTENTLESS = payload('Edit', { file_path: MODULE_CONFIG })

afterEach(() => {
  vi.restoreAllMocks()
})

Feature('Guarding oxlint configs against silenced rules')
  .withScenarioLayer(memoryFileSystemLayer.pipe(Layer.provide(Layer.succeed(Contents, {}))))
  .body(({ scenario, scenarioOutline }) => {
    scenarioOutline(
      'An edit that turns a rule off in <config> is refused, naming the rule',
      [
        {
          config: 'oxlint.config.ts',
          payload: EDIT_ADD_OFF,
          seed: { '/oxlint.config.ts': "rules: { 'no-debugger': 'warn' }" },
        },
        { config: 'oxlint.json', payload: EDIT_JSON_ADD_OFF, seed: { '/oxlint.json': JSON_DISK_ERROR } },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('the agent prepared an edit to <config> that turns no-debugger off')('context', () =>
            Effect.sync(() => ({
              payload: row.payload,
              contents: row.seed,
              errSpy: vi.spyOn(console, 'error'),
              logSpy: vi.spyOn(console, 'log'),
            }))),
          When('the agent sends the edit to the hook')(
            'result',
            (s) => runWithFs(s.context.payload, s.context.contents),
          ),
          Then('the hook refuses the edit with exit code 2')((s) => {
            expect(s.result).toBe(2)
          }),
          And('the refusal names the rule no-debugger')((s) => {
            expect(stderrText(s.context.errSpy.mock.calls)).toContain('no-debugger')
          }),
        ),
    )

    scenario(
      'A benign Edit hunk on a JSON config is allowed',
      Gherkin.Do.pipe(
        Given('oxlint.json on disk sets no-debugger to error and the edit lowers it to warn')(
          'context',
          () =>
            Effect.sync(() => ({
              payload: EDIT_JSON_BENIGN,
              contents: { '/oxlint.json': JSON_DISK_ERROR },
              errSpy: vi.spyOn(console, 'error'),
              logSpy: vi.spyOn(console, 'log'),
            })),
        ),
        When('the agent sends the edit to the hook')('result', (s) => runWithFs(s.context.payload, s.context.contents)),
        Then('the hook allows the edit with exit code 0')((s) => {
          expect(s.result).toBe(0)
        }),
        And('the hook writes no diagnostic')((s) => {
          expect(s.context.errSpy).not.toHaveBeenCalled()
          expect(s.context.logSpy).not.toHaveBeenCalled()
        }),
      ),
    )

    scenario(
      'An Edit that disables a rule with the numeric severity 0 on a JSON config is refused, naming the rule',
      Gherkin.Do.pipe(
        Given('oxlint.json on disk sets no-debugger to error and the edit changes it to the numeric 0')(
          'context',
          () =>
            Effect.sync(() => ({
              payload: EDIT_JSON_TO_ZERO,
              contents: { '/oxlint.json': JSON_DISK_ERROR },
              errSpy: vi.spyOn(console, 'error'),
              logSpy: vi.spyOn(console, 'log'),
            })),
        ),
        When('the agent sends the edit to the hook')('result', (s) => runWithFs(s.context.payload, s.context.contents)),
        Then('the hook refuses the edit with exit code 2')((s) => {
          expect(s.result).toBe(2)
        }),
        And('the refusal names the rule no-debugger')((s) => {
          expect(stderrText(s.context.errSpy.mock.calls)).toContain('no-debugger')
        }),
      ),
    )

    scenario(
      'An Edit that disables a rule with the severity allow on a JSON config is refused, naming the rule',
      Gherkin.Do.pipe(
        Given('oxlint.json on disk sets no-debugger to error and the edit changes it to allow')(
          'context',
          () =>
            Effect.sync(() => ({
              payload: EDIT_JSON_TO_ALLOW,
              contents: { '/oxlint.json': JSON_DISK_ERROR },
              errSpy: vi.spyOn(console, 'error'),
              logSpy: vi.spyOn(console, 'log'),
            })),
        ),
        When('the agent sends the edit to the hook')('result', (s) => runWithFs(s.context.payload, s.context.contents)),
        Then('the hook refuses the edit with exit code 2')((s) => {
          expect(s.result).toBe(2)
        }),
        And('the refusal names the rule no-debugger')((s) => {
          expect(stderrText(s.context.errSpy.mock.calls)).toContain('no-debugger')
        }),
      ),
    )

    scenario(
      'An Edit hunk whose old_string is absent from the on-disk config fails closed, naming the hunk',
      Gherkin.Do.pipe(
        Given('oxlint.json on disk has no no-restricted-globals entry and the edit targets one')(
          'context',
          () =>
            Effect.sync(() => ({
              payload: EDIT_HUNK_ABSENT,
              contents: { '/oxlint.json': JSON_DISK_ERROR },
              errSpy: vi.spyOn(console, 'error'),
              logSpy: vi.spyOn(console, 'log'),
            })),
        ),
        When('the agent sends the edit to the hook')('result', (s) => runWithFs(s.context.payload, s.context.contents)),
        Then('the hook refuses the edit with exit code 2')((s) => {
          expect(s.result).toBe(2)
        }),
        And('the refusal says the change cannot be verified')((s) => {
          expect(stderrText(s.context.errSpy.mock.calls)).toContain('cannot verify')
        }),
        And('the refusal names the missing hunk')((s) => {
          expect(stderrText(s.context.errSpy.mock.calls)).toContain('no-restricted-globals')
        }),
      ),
    )

    scenarioOutline(
      'Writing a brand-new <kind> config with <tool> that turns a rule off is refused',
      [
        { tool: 'Write', kind: 'module', payload: WRITE_NEW_WITH_OFF },
        { tool: 'Write', kind: 'JSON', payload: WRITE_NEW_JSON_WITH_OFF },
        { tool: 'Create', kind: 'module', payload: CREATE_NEW_WITH_OFF },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('no config file exists on disk yet')('context', () =>
            Effect.sync(() => ({
              payload: row.payload,
              errSpy: vi.spyOn(console, 'error'),
              logSpy: vi.spyOn(console, 'log'),
            }))),
          When('the agent writes a config with <tool> whose rules turn no-debugger off')('result', (s) =>
            runWithFs(s.context.payload, {})),
          Then('the hook refuses the write with exit code 2')((s) => {
            expect(s.result).toBe(2)
          }),
          And('the refusal names the rule no-debugger')((s) => {
            expect(stderrText(s.context.errSpy.mock.calls)).toContain('no-debugger')
          }),
        ),
    )

    scenario(
      'A multi-hunk edit where one hunk turns a rule off is refused',
      Gherkin.Do.pipe(
        Given('the agent prepared a multi-hunk edit whose second hunk turns no-debugger off')(
          'context',
          () =>
            Effect.sync(() => ({
              payload: MULTI_EDIT_ONE_HUNK_OFF,
              contents: {
                '/oxlint.config.ts': "export default { rules: { 'no-console': 'warn', 'no-debugger': 'warn' } }",
              },
              errSpy: vi.spyOn(console, 'error'),
              logSpy: vi.spyOn(console, 'log'),
            })),
        ),
        When('the agent sends the edit to the hook')('result', (s) => runWithFs(s.context.payload, s.context.contents)),
        Then('the hook refuses the edit with exit code 2')((s) => {
          expect(s.result).toBe(2)
        }),
        And('the refusal names the rule no-debugger')((s) => {
          expect(stderrText(s.context.errSpy.mock.calls)).toContain('no-debugger')
        }),
      ),
    )

    scenario(
      'A MultiEdit whose hunks apply sequentially and end by turning a rule off is refused, naming the rule',
      Gherkin.Do.pipe(
        Given(
          'the agent prepared a MultiEdit whose second hunk targets the output of the first and ends in off',
        )('context', () =>
          Effect.sync(() => ({
            payload: MULTI_EDIT_SEQUENTIAL_OFF,
            contents: { '/oxlint.json': JSON_DISK_ERROR },
            errSpy: vi.spyOn(console, 'error'),
            logSpy: vi.spyOn(console, 'log'),
          }))),
        When('the agent sends the edit to the hook')('result', (s) => runWithFs(s.context.payload, s.context.contents)),
        Then('the hook refuses the edit with exit code 2')((s) => {
          expect(s.result).toBe(2)
        }),
        And('the refusal names the rule no-debugger')((s) => {
          expect(stderrText(s.context.errSpy.mock.calls)).toContain('no-debugger')
        }),
      ),
    )

    scenarioOutline(
      'A config change arriving as <kind> is refused because it cannot be verified',
      [
        {
          kind: 'an unparseable JSON replacement',
          payload: EDIT_JSON_UNPARSEABLE,
          seed: { '/oxlint.json': '{"rules":{}}' },
        },
        { kind: 'a raw morph edit with hunks', payload: MORPH_RAW, seed: {} },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('the agent prepared <kind> targeting oxlint.json')('context', () =>
            Effect.sync(() => ({
              payload: row.payload,
              contents: row.seed,
              errSpy: vi.spyOn(console, 'error'),
              logSpy: vi.spyOn(console, 'log'),
            }))),
          When('the agent sends the change to the hook')('result', (s) =>
            runWithFs(s.context.payload, s.context.contents)),
          Then('the hook refuses the change with exit code 2')((s) => {
            expect(s.result).toBe(2)
          }),
          And('the refusal says the change cannot be verified')((s) => {
            expect(stderrText(s.context.errSpy.mock.calls)).toContain('cannot verify')
          }),
        ),
    )

    scenario(
      'A morph file_edits edit that turns a rule off on a JSON config is refused, naming the rule',
      Gherkin.Do.pipe(
        Given('a morph edit replaces the error severity of no-debugger with off')('context', () =>
          Effect.sync(() => ({
            payload: MORPH_FILE_EDITS_OFF,
            contents: { '/oxlint.json': JSON_DISK_ERROR },
            errSpy: vi.spyOn(console, 'error'),
            logSpy: vi.spyOn(console, 'log'),
          }))),
        When('the agent sends the edit to the hook')('result', (s) => runWithFs(s.context.payload, s.context.contents)),
        Then('the hook refuses the edit with exit code 2')((s) => {
          expect(s.result).toBe(2)
        }),
        And('the refusal names the rule no-debugger')((s) => {
          expect(stderrText(s.context.errSpy.mock.calls)).toContain('no-debugger')
        }),
      ),
    )

    scenarioOutline(
      'Rewriting <config> while keeping the off severities is allowed silently',
      [
        {
          config: 'oxlint.config.ts',
          payload: WRITE_PRESERVES_OFF,
          seed: { '/oxlint.config.ts': PRESERVE_OFF_CONTENT },
        },
        { config: 'oxlint.json', payload: WRITE_PRESERVES_JSON, seed: { '/oxlint.json': PRESERVE_JSON } },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('<config> on disk has no-debugger set to off')('context', () =>
            Effect.sync(() => ({
              payload: row.payload,
              contents: row.seed,
              errSpy: vi.spyOn(console, 'error'),
              logSpy: vi.spyOn(console, 'log'),
            }))),
          When('the agent rewrites the file keeping the off severity')('result', (s) =>
            runWithFs(s.context.payload, s.context.contents)),
          Then('the hook allows the rewrite with exit code 0')((s) => {
            expect(s.result).toBe(0)
          }),
          And('the hook writes no diagnostic')((s) => {
            expect(s.context.errSpy).not.toHaveBeenCalled()
            expect(s.context.logSpy).not.toHaveBeenCalled()
          }),
        ),
    )

    scenario(
      'A relative path to a config is read from the working directory once',
      Gherkin.Do.pipe(
        Given('oxlint.json exists at src/oxlint.json with no-debugger set to off')('context', () =>
          Effect.sync(() => ({
            payload: RELATIVE_WRITE,
            contents: { '/src/oxlint.json': PRESERVE_JSON },
          }))),
        When('the agent rewrites it through the relative path src/oxlint.json keeping the off severity')(
          'result',
          (s) => runWithFs(s.context.payload, s.context.contents),
        ),
        Then('the hook allows the rewrite with exit code 0')((s) => {
          expect(s.result).toBe(0)
        }),
      ),
    )

    scenario(
      'An edit that only changes the ignored folders is allowed',
      Gherkin.Do.pipe(
        Given('oxlint.config.ts on disk lists dist in ignorePatterns')('context', () =>
          Effect.sync(() => ({
            payload: EDIT_IGNOREPATTERNS,
            contents: { '/oxlint.config.ts': "export default { ignorePatterns: ['dist'] }" },
          }))),
        When('the agent sends the edit to the hook')('result', (s) => runWithFs(s.context.payload, s.context.contents)),
        Then('the hook allows the edit with exit code 0')((s) => {
          expect(s.result).toBe(0)
        }),
      ),
    )

    scenario(
      'An overrides[].rules disable on a JSON config is refused, naming the rule',
      Gherkin.Do.pipe(
        Given('oxlint.json on disk disables no-debugger inside an override and the edit turns it off')(
          'context',
          () =>
            Effect.sync(() => ({
              payload: EDIT_OVERRIDES_OFF,
              contents: { '/oxlint.json': OVERRIDES_DISK },
              errSpy: vi.spyOn(console, 'error'),
              logSpy: vi.spyOn(console, 'log'),
            })),
        ),
        When('the agent sends the edit to the hook')('result', (s) => runWithFs(s.context.payload, s.context.contents)),
        Then('the hook refuses the edit with exit code 2')((s) => {
          expect(s.result).toBe(2)
        }),
        And('the refusal names the rule no-debugger')((s) => {
          expect(stderrText(s.context.errSpy.mock.calls)).toContain('no-debugger')
        }),
      ),
    )

    scenario(
      'A module config whose non-rule key outside the rules map is off is allowed',
      Gherkin.Do.pipe(
        Given('the edit adds a constant carrying a telemetry off severity outside the rules map')(
          'context',
          () =>
            Effect.sync(() => ({
              payload: EDIT_MODULE_NONRULE_OFF,
              contents: { '/oxlint.config.ts': MODULE_DISK_WARN },
              errSpy: vi.spyOn(console, 'error'),
              logSpy: vi.spyOn(console, 'log'),
            })),
        ),
        When('the agent sends the edit to the hook')('result', (s) => runWithFs(s.context.payload, s.context.contents)),
        Then('the hook allows the edit with exit code 0')((s) => {
          expect(s.result).toBe(0)
        }),
        And('the hook writes no diagnostic')((s) => {
          expect(s.context.errSpy).not.toHaveBeenCalled()
          expect(s.context.logSpy).not.toHaveBeenCalled()
        }),
      ),
    )

    scenario(
      'An edit to a source file is allowed even when its new content mentions an off rule',
      Gherkin.Do.pipe(
        Given('the agent prepared an edit to a source file whose new content mentions an off rule')(
          'payload',
          () => Effect.succeed(EDIT_NON_CONFIG_TARGET),
        ),
        When('the agent sends the edit to the hook')('result', (s) => runWithFs(s.payload, {})),
        Then('the hook allows the edit with exit code 0')((s) => {
          expect(s.result).toBe(0)
        }),
      ),
    )

    scenario(
      'An edit payload that carries no content is allowed',
      Gherkin.Do.pipe(
        Given('the agent prepared an edit payload with no content fields')(
          'payload',
          () => Effect.succeed(EDIT_CONTENTLESS),
        ),
        When('the hook receives the payload')('result', (s) => runWithFs(s.payload, {})),
        Then('the hook allows it with exit code 0')((s) => {
          expect(s.result).toBe(0)
        }),
      ),
    )

    scenario(
      'A non-edit tool payload is ignored',
      Gherkin.Do.pipe(
        Given('the agent sent a Read tool payload that targets oxlint.json')(
          'payload',
          () => Effect.succeed(payload('Read', { file_path: 'oxlint.json' })),
        ),
        When('the hook receives the payload')('result', (s) => runWithFs(s.payload, {})),
        Then('the hook allows it with exit code 0')((s) => {
          expect(s.result).toBe(0)
        }),
      ),
    )

    scenario(
      'Input that is not a hook payload is ignored',
      Gherkin.Do.pipe(
        Given('the hook receives text that is not a hook payload')('input', () => Effect.succeed('this is not json')),
        When('the hook inspects the input')('result', (s) => runWithFs(s.input, {})),
        Then('the hook allows it with exit code 0')((s) => {
          expect(s.result).toBe(0)
        }),
      ),
    )
  })
