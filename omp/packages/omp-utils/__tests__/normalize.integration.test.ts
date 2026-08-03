/**
 * OMP hook input — Claude Code shape translation.
 *
 * Claude Code hooks receive PascalCase tool names and `file_path` /
 * `old_string` / `new_string` keys; OMP emits lowercase tool names with
 * `path` and `edits`. The bridge translates between the two shapes so the
 * settings.json hooks an OMP user configures see the same names the
 * Claude Code docs describe.
 *
 * These kernels have no shell wrapper inside this package — they are
 * boundary translations composed by the hook dispatcher in `omp-claude-compat`.
 * Reaching them through the package barrel satisfies the
 * `behaviour-exercises-use-case` rule and exercises the public surface a
 * downstream consumer imports.
 */
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import {
  denormalizeToolInput,
  extractShellCommand,
  isContextModeShellTool,
  matchesMatcher,
  normalizeToolInput,
  normalizeToolName,
  sessionIds,
} from '../src/mod.js'

const Feature = makeFeature({ it, layer })

Feature('OMP hook input — Claude Code shape translation').body(({ scenario, scenarioOutline }) => {
  scenarioOutline(
    'A lowercase OMP tool name is renamed to its PascalCase Claude Code counterpart',
    [
      { name: 'write', expected: 'Write' },
      { name: 'bash', expected: 'Bash' },
      { name: 'read', expected: 'Read' },
    ],
    (row) =>
      Gherkin.Do.pipe(
        Given('an OMP tool name in lowercase')('row', () => Effect.succeed(row)),
        When('the bridge normalizes it for Claude Code')('out', (s) => Effect.succeed(normalizeToolName(s.row.name))),
        Then('Claude Code sees the PascalCase equivalent')((s) =>
          Effect.sync(() => {
            expect(s.out).toBe(s.row.expected)
          })
        ),
      ),
  )

  scenario(
    'An OMP tool name with no Claude Code equivalent keeps its first-letter capitalization',
    Gherkin.Do.pipe(
      Given('an OMP-only tool name with no Claude Code counterpart')('name', () => Effect.succeed('github')),
      When('the bridge normalizes it for Claude Code')('out', (s) => Effect.succeed(normalizeToolName(s.name))),
      Then('Claude Code sees the same PascalCase form OMP users see')((s) =>
        Effect.sync(() => {
          expect(s.out).toBe('Github')
        })
      ),
    ),
  )

  scenarioOutline(
    'An OMP tool name with an explicit Claude Code alias maps to the alias',
    [
      { name: 'web_search', expected: 'WebSearch' },
      { name: 'todo', expected: 'TodoWrite' },
      { name: 'ask', expected: 'AskUserQuestion' },
    ],
    (row) =>
      Gherkin.Do.pipe(
        Given('an OMP tool name with an alias table entry')('row', () => Effect.succeed(row)),
        When('the bridge normalizes it for Claude Code')('out', (s) => Effect.succeed(normalizeToolName(s.row.name))),
        Then('Claude Code sees the aliased PascalCase name')((s) =>
          Effect.sync(() => {
            expect(s.out).toBe(s.row.expected)
          })
        ),
      ),
  )

  scenario(
    'An mcp__-prefixed tool name is delivered to Claude Code verbatim',
    Gherkin.Do.pipe(
      Given('an MCP-prefixed tool name')('name', () => Effect.succeed('mcp__foo_bar')),
      When('the bridge normalizes it for Claude Code')('out', (s) => Effect.succeed(normalizeToolName(s.name))),
      Then('Claude Code receives the name exactly as OMP sent it')((s) =>
        Effect.sync(() => {
          expect(s.out).toBe('mcp__foo_bar')
        })
      ),
    ),
  )

  scenario(
    'An OMP-only tool name falls back to first-letter capitalization',
    Gherkin.Do.pipe(
      Given('an OMP-only tool name that has no alias')('name', () => Effect.succeed('eval')),
      When('the bridge normalizes it for Claude Code')('out', (s) => Effect.succeed(normalizeToolName(s.name))),
      Then('Claude Code sees a capitalized form so existing matchers keep working')((s) =>
        Effect.sync(() => {
          expect(s.out).toBe('Eval')
        })
      ),
    ),
  )

  scenario(
    'An empty tool name is delivered to Claude Code as the empty string',
    Gherkin.Do.pipe(
      Given('the empty tool name')('name', () => Effect.succeed('')),
      When('the bridge normalizes it for Claude Code')('out', (s) => Effect.succeed(normalizeToolName(s.name))),
      Then('Claude Code receives the empty string unchanged')((s) =>
        Effect.sync(() => {
          expect(s.out).toBe('')
        })
      ),
    ),
  )

  scenarioOutline(
    'A file tool input carrying OMP "path" is rewritten to Claude Code "file_path"',
    [
      { tool: 'Write', input: { path: 'src/foo.ts', content: 'export {}' }, expectFilePath: 'src/foo.ts' },
      { tool: 'Write', input: { file_path: 'src/foo.ts', content: 'x' }, expectFilePath: 'src/foo.ts' },
    ],
    (row) =>
      Gherkin.Do.pipe(
        Given('a file tool input')('row', () => Effect.succeed(row)),
        When('the bridge normalizes it for Claude Code')('out', (s) =>
          Effect.succeed(normalizeToolInput(s.row.tool, s.row.input))),
        Then('Claude Code sees file_path with the original value')((s) =>
          Effect.sync(() => {
            expect(s.out['file_path']).toBe(s.row.expectFilePath)
          })
        ),
      ),
  )

  scenario(
    'A non-file tool input passes through the bridge unchanged',
    Gherkin.Do.pipe(
      Given('a Bash input with no path key')('input', () => Effect.succeed({ command: 'npx eslint .' })),
      When('the bridge normalizes it for Claude Code')(
        'out',
        (s) => Effect.succeed(normalizeToolInput('Bash', s.input)),
      ),
      Then('Claude Code receives the input exactly as OMP sent it')((s) =>
        Effect.sync(() => {
          expect(s.out).toEqual(s.input)
        })
      ),
    ),
  )

  scenarioOutline(
    'An edit tool input with OMP edits array is rewritten to old_string / new_string',
    [
      {
        tool: 'Edit',
        input: { path: 'src/foo.ts', edits: [{ old_text: 'a', new_text: 'b // c' }] },
        newString: 'b // c',
        oldString: 'a',
      },
      {
        tool: 'MultiEdit',
        input: {
          path: 'src/foo.ts',
          edits: [{ old_text: 'a', new_text: 'x' }, { old_text: 'b', new_text: 'y' }],
        },
        newString: 'x\ny',
        oldString: 'a\nb',
      },
    ],
    (row) =>
      Gherkin.Do.pipe(
        Given('an edit tool input carrying an edits array')('row', () => Effect.succeed(row)),
        When('the bridge normalizes it for Claude Code')('out', (s) =>
          Effect.succeed(normalizeToolInput(s.row.tool, s.row.input))),
        Then('Claude Code sees old_string and new_string with the joined values')((s) =>
          Effect.sync(() => {
            expect(s.out['new_string']).toBe(s.row.newString)
            expect(s.out['old_string']).toBe(s.row.oldString)
          })
        ),
      ),
  )

  scenario(
    'An edit input already in Claude Code shape is delivered unchanged',
    Gherkin.Do.pipe(
      Given('an edit input already using file_path and old_string / new_string')(
        'input',
        () => Effect.succeed({ file_path: 'src/foo.ts', old_string: 'a', new_string: 'b // c' }),
      ),
      When('the bridge normalizes it for Claude Code')(
        'out',
        (s) => Effect.succeed(normalizeToolInput('Edit', s.input)),
      ),
      Then('Claude Code receives the input exactly as OMP sent it')((s) =>
        Effect.sync(() => {
          expect(s.out).toEqual(s.input)
        })
      ),
    ),
  )

  scenario(
    'A hashline-style patch input is parsed for added content',
    Gherkin.Do.pipe(
      Given('an edit input carrying a hashline patch')('input', () =>
        Effect.succeed({
          path: 'src/foo.ts',
          input: '[src/foo.ts#A1B2]\nSWAP 1.=1:\n+// a comment\n+const x = 1',
        })),
      When('the bridge normalizes it for Claude Code')(
        'out',
        (s) => Effect.succeed(normalizeToolInput('Edit', s.input)),
      ),
      Then('Claude Code sees the added lines as new_string with no old_string')((s) =>
        Effect.sync(() => {
          expect(s.out['new_string']).toBe('// a comment\nconst x = 1')
          expect(s.out['old_string']).toBeUndefined()
        })
      ),
    ),
  )

  scenario(
    'An apply-patch input separates added and removed lines',
    Gherkin.Do.pipe(
      Given('an edit input carrying an apply-patch payload')('input', () =>
        Effect.succeed({
          path: 'src/foo.ts',
          input: '*** Begin Patch\n*** Update File: src/foo.ts\n-const x = 1\n+const x = 2\n*** End Patch',
        })),
      When('the bridge normalizes it for Claude Code')(
        'out',
        (s) => Effect.succeed(normalizeToolInput('Edit', s.input)),
      ),
      Then('Claude Code sees the removed line as old_string and the added line as new_string')((s) =>
        Effect.sync(() => {
          expect(s.out['new_string']).toBe('const x = 2')
          expect(s.out['old_string']).toBe('const x = 1')
        })
      ),
    ),
  )

  scenario(
    'A patch line whose first character is itself a sigil keeps a single leading +',
    Gherkin.Do.pipe(
      Given('an edit input whose added line begins with a + sigil')(
        'input',
        () => Effect.succeed({ path: 'doc.md', input: '[doc.md#A1B2]\nINS.TAIL:\n++ nested bullet\n+' }),
      ),
      When('the bridge normalizes it for Claude Code')(
        'out',
        (s) => Effect.succeed(normalizeToolInput('Edit', s.input)),
      ),
      Then('Claude Code sees the line with exactly one leading +')((s) =>
        Effect.sync(() => {
          expect(s.out['new_string']).toBe('+ nested bullet\n')
        })
      ),
    ),
  )

  scenario(
    'A patch input with no marked lines yields no content fields',
    Gherkin.Do.pipe(
      Given('an edit input carrying only deletions')(
        'input',
        () => Effect.succeed({ path: 'src/foo.ts', input: '[src/foo.ts#A1B2]\nDEL 3' }),
      ),
      When('the bridge normalizes it for Claude Code')(
        'out',
        (s) => Effect.succeed(normalizeToolInput('Edit', s.input)),
      ),
      Then('Claude Code sees no old_string and no new_string')((s) =>
        Effect.sync(() => {
          expect(s.out['new_string']).toBeUndefined()
          expect(s.out['old_string']).toBeUndefined()
        })
      ),
    ),
  )

  scenario(
    'A patch input on a non-edit tool is delivered untouched',
    Gherkin.Do.pipe(
      Given('a Write input carrying a patch payload')(
        'input',
        () => Effect.succeed({ path: 'src/foo.ts', input: '+const x = 1' }),
      ),
      When('the bridge normalizes it for Claude Code')(
        'out',
        (s) => Effect.succeed(normalizeToolInput('Write', s.input)),
      ),
      Then('Claude Code receives file_path and the patch payload unchanged')((s) =>
        Effect.sync(() => {
          expect(s.out).toEqual({ file_path: 'src/foo.ts', input: '+const x = 1' })
        })
      ),
    ),
  )

  scenarioOutline(
    'A matcher expression is matched against the tool name',
    [
      { matcher: '', name: 'Write', matched: true },
      { matcher: undefined, name: 'Write', matched: true },
      { matcher: 'Write', name: 'Write', matched: true },
      { matcher: 'Write', name: 'Bash', matched: false },
      { matcher: 'Write|Edit|Create', name: 'Write', matched: true },
      { matcher: 'Write|Edit|Create', name: 'Edit', matched: true },
      { matcher: 'Write|Edit|Create', name: 'Bash', matched: false },
    ],
    (row) =>
      Gherkin.Do.pipe(
        Given('a hook matcher pattern and the active tool name')('row', () => Effect.succeed(row)),
        When('the bridge evaluates the matcher')('matched', (s) =>
          Effect.succeed(matchesMatcher(s.row.name, s.row.matcher))),
        Then('the hook fires only when the matcher accepts the tool')((s) =>
          Effect.sync(() => {
            expect(s.matched).toBe(s.row.matched)
          })
        ),
      ),
  )

  scenario(
    'A malformed matcher expression does not throw and the hook runs (fail closed)',
    Gherkin.Do.pipe(
      Given('a malformed matcher pattern from settings.json')('pattern', () => Effect.succeed('Write(')),
      When('the bridge evaluates the matcher')('matched', (s) => Effect.succeed(matchesMatcher('Write', s.pattern))),
      Then('the bridge fails closed and lets the hook run')((s) =>
        Effect.sync(() => {
          expect(s.matched).toBe(true)
        })
      ),
    ),
  )

  scenario(
    'A malformed matcher is not re-compiled on repeat calls',
    Gherkin.Do.pipe(
      Given('a malformed matcher pattern that was already evaluated')('pattern', () => Effect.succeed('Write(')),
      When('the bridge evaluates the matcher against several tool names')(
        'matches',
        (s) => Effect.succeed(['Write', 'Edit', 'Bash'].map((name) => matchesMatcher(name, s.pattern))),
      ),
      Then('every call returns the same fail-closed verdict')((s) =>
        Effect.sync(() => {
          expect(s.matches).toEqual([true, true, true])
        })
      ),
    ),
  )

  scenarioOutline(
    'A context-mode tool call is recognized as a shell surface',
    [
      { tool: 'ctx_execute', input: { language: 'shell', code: 'ls' }, recognized: true },
      { tool: 'ctx_execute', input: { language: 'javascript', code: '1+1' }, recognized: false },
      { tool: 'ctx_batch_execute', input: { commands: [{ command: 'ls' }] }, recognized: true },
      { tool: 'bash', input: { command: 'ls' }, recognized: false },
    ],
    (row) =>
      Gherkin.Do.pipe(
        Given('a context-mode tool call')('row', () => Effect.succeed(row)),
        When('the bridge inspects whether it is a shell surface')('recognized', (s) =>
          Effect.succeed(isContextModeShellTool(s.row.tool, s.row.input))),
        Then('only shell-mode context-mode calls count as a shell surface')((s) =>
          Effect.sync(() => {
            expect(s.recognized).toBe(s.row.recognized)
          })
        ),
      ),
  )

  scenarioOutline(
    'A context-mode tool call has its shell command extracted for shell-guard hooks',
    [
      { tool: 'ctx_execute', input: { language: 'shell', code: 'git status' }, command: 'git status' },
      {
        tool: 'ctx_batch_execute',
        input: { commands: [{ command: 'git status' }, { command: 'git log' }] },
        command: 'git status\ngit log',
      },
      { tool: 'bash', input: { command: 'ls' }, command: undefined },
    ],
    (row) =>
      Gherkin.Do.pipe(
        Given('a context-mode tool call')('row', () => Effect.succeed(row)),
        When('the bridge extracts the shell command')('command', (s) =>
          Effect.succeed(extractShellCommand(s.row.tool, s.row.input))),
        Then('the shell-guard hook sees the joined shell text')((s) =>
          Effect.sync(() => {
            expect(s.command).toBe(s.row.command)
          })
        ),
      ),
  )

  scenario(
    'Session ids materialise as a session_id with no agent_id',
    Gherkin.Do.pipe(
      Given('a session manager that returns the session id')('getter', () => Effect.succeed(() => 'sess-123')),
      When('the bridge builds the session ids payload')('ids', (s) => Effect.succeed(sessionIds(s.getter))),
      Then('the payload carries the session id and a null agent id')((s) =>
        Effect.sync(() => {
          expect(s.ids).toEqual({ session_id: 'sess-123', agent_id: null })
        })
      ),
    ),
  )

  scenario(
    'A denormalized payload round-trips an updated file_path back to the original path key',
    Gherkin.Do.pipe(
      Given('an original OMP input carrying path and an updated payload carrying file_path')(
        'input',
        () =>
          Effect.succeed({
            original: { path: 'src/foo.ts', content: 'x' },
            updated: { file_path: 'src/foo.ts', content: 'x' },
          }),
      ),
      When('the bridge reverses the normalization')(
        'out',
        (s) => Effect.succeed(denormalizeToolInput(s.input.original, s.input.updated)),
      ),
      Then('the bridge restores the original path key')((s) =>
        Effect.sync(() => {
          expect(s.out['path']).toBe('src/foo.ts')
        })
      ),
    ),
  )
})
