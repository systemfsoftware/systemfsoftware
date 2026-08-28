import * as NodePath from '@effect/platform-node-shared/NodePath'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect, Layer } from 'effect'
import { afterEach, expect } from 'vitest'
import { FileReferencedContentLive } from '../../src/inject/file-referenced-content.js'
import { __resetNoInjectRefsForTesting, NoInjectRefsLive } from '../../src/inject/no-inject-refs.js'
import { ReferencedContent } from '../../src/inject/referenced-content.js'

afterEach(() => {
  __resetNoInjectRefsForTesting()
})

const Feature = makeFeature({ it, layer })

const baseLayer = Layer.mergeAll(NodePath.layer, NoInjectRefsLive)

const makeLayer = (contents: Record<string, string>) =>
  FileReferencedContentLive.pipe(
    Layer.provide(Layer.mergeAll(MemoryFileSystem.layerWith(contents), baseLayer)),
  )

Feature('FileReferencedContent adapter — extraction, resolution, and injection').body(({ scenario }) => {
  scenario(
    'Should extract plain @-refs from CLAUDE.md',
    {
      scenarioLayer: makeLayer({
        '/test/CLAUDE.md': '@rules/typescript.md\n',
        '/test/rules/typescript.md': '# TypeScript Rules\n\nUse strict mode.',
      }),
    },
    Gherkin.Do.pipe(
      Given('a CLAUDE.md with a plain @-ref')('ctx', () => Effect.succeed({ cwd: '/test' })),
      When('ReferencedContent.load is called')('result', (s) =>
        Effect.gen(function*() {
          const rc = yield* ReferencedContent
          return yield* rc.load(s.ctx.cwd)
        })),
      Then('result should include the referenced file content')((s) =>
        Effect.sync(() => {
          expect(s.result).toContain('# TypeScript Rules')
          expect(s.result).toContain('Use strict mode.')
        })
      ),
    ),
  )

  scenario(
    'Should extract refs from bullet list lines starting with dash',
    {
      scenarioLayer: makeLayer({
        '/test/CLAUDE.md': '- @rules/lint.md\n',
        '/test/rules/lint.md': 'Lint rules content',
      }),
    },
    Gherkin.Do.pipe(
      Given('a CLAUDE.md with a dash-prefixed @-ref')('ctx', () => Effect.succeed({ cwd: '/test' })),
      When('ReferencedContent.load is called')('result', (s) =>
        Effect.gen(function*() {
          const rc = yield* ReferencedContent
          return yield* rc.load(s.ctx.cwd)
        })),
      Then('result should include the referenced content')((s) =>
        Effect.sync(() => {
          expect(s.result).toContain('Lint rules content')
        })
      ),
    ),
  )

  scenario(
    'Should extract refs when star and plus markers are used',
    {
      scenarioLayer: makeLayer({
        '/test/CLAUDE.md': '* @config/eslint.md\n\n+ @config/prettier.md\n',
        '/test/config/eslint.md': 'ESLint: error',
        '/test/config/prettier.md': 'Prettier: warn',
      }),
    },
    Gherkin.Do.pipe(
      Given('a CLAUDE.md with star and plus prefixed @-refs')('ctx', () => Effect.succeed({ cwd: '/test' })),
      When('ReferencedContent.load is called')('result', (s) =>
        Effect.gen(function*() {
          const rc = yield* ReferencedContent
          return yield* rc.load(s.ctx.cwd)
        })),
      Then('result should include both referenced files')((s) =>
        Effect.sync(() => {
          expect(s.result).toContain('ESLint: error')
          expect(s.result).toContain('Prettier: warn')
        })
      ),
    ),
  )

  scenario(
    'Should skip missing referenced file',
    {
      scenarioLayer: makeLayer({
        '/test/CLAUDE.md': '@rules/missing.md\n',
      }),
    },
    Gherkin.Do.pipe(
      Given('a CLAUDE.md referencing a non-existent file')('ctx', () => Effect.succeed({ cwd: '/test' })),
      When('ReferencedContent.load is called')('result', (s) =>
        Effect.gen(function*() {
          const rc = yield* ReferencedContent
          return yield* rc.load(s.ctx.cwd)
        })),
      Then('result should be empty')((s) =>
        Effect.sync(() => {
          expect(s.result).toBe('')
        })
      ),
    ),
  )

  scenario(
    'Should reject absolute path refs starting with slash',
    {
      scenarioLayer: makeLayer({
        '/test/CLAUDE.md': '@/etc/passwd\n',
      }),
    },
    Gherkin.Do.pipe(
      Given('a CLAUDE.md with an absolute path @-ref')('ctx', () => Effect.succeed({ cwd: '/test' })),
      When('ReferencedContent.load is called')('result', (s) =>
        Effect.gen(function*() {
          const rc = yield* ReferencedContent
          return yield* rc.load(s.ctx.cwd)
        })),
      Then('result should be empty')((s) =>
        Effect.sync(() => {
          expect(s.result).toBe('')
        })
      ),
    ),
  )

  scenario(
    'Should reject path traversal refs with dot-dot',
    {
      scenarioLayer: makeLayer({
        '/test/CLAUDE.md': '@../outside.txt\n',
      }),
    },
    Gherkin.Do.pipe(
      Given('a CLAUDE.md with a dot-dot traversal')('ctx', () => Effect.succeed({ cwd: '/test' })),
      When('ReferencedContent.load is called')('result', (s) =>
        Effect.gen(function*() {
          const rc = yield* ReferencedContent
          return yield* rc.load(s.ctx.cwd)
        })),
      Then('result should be empty')((s) =>
        Effect.sync(() => {
          expect(s.result).toBe('')
        })
      ),
    ),
  )

  scenario(
    'Should reject refs containing a space',
    {
      scenarioLayer: makeLayer({
        '/test/CLAUDE.md': '@rules/with space.md\n',
        '/test/rules/with space.md': 'should not be injected',
      }),
    },
    Gherkin.Do.pipe(
      Given('a CLAUDE.md with a space-containing @-ref')('ctx', () => Effect.succeed({ cwd: '/test' })),
      When('ReferencedContent.load is called')('result', (s) =>
        Effect.gen(function*() {
          const rc = yield* ReferencedContent
          return yield* rc.load(s.ctx.cwd)
        })),
      Then('result should be empty because the ref is rejected')((s) =>
        Effect.sync(() => {
          expect(s.result).toBe('')
        })
      ),
    ),
  )

  scenario(
    'Should return empty when no refs found',
    {
      scenarioLayer: makeLayer({
        '/test/CLAUDE.md': 'No refs in here\n',
      }),
    },
    Gherkin.Do.pipe(
      Given('a CLAUDE.md with no @-refs')('ctx', () => Effect.succeed({ cwd: '/test' })),
      When('ReferencedContent.load is called')('result', (s) =>
        Effect.gen(function*() {
          const rc = yield* ReferencedContent
          return yield* rc.load(s.ctx.cwd)
        })),
      Then('result should be empty')((s) =>
        Effect.sync(() => {
          expect(s.result).toBe('')
        })
      ),
    ),
  )

  scenario(
    'Should load refs from .claude/CLAUDE.md when root CLAUDE.md is missing',
    {
      scenarioLayer: makeLayer({
        '/test/.claude/CLAUDE.md': '@.claude/rules.md\n',
        '/test/.claude/rules.md': '.claude rules content',
      }),
    },
    Gherkin.Do.pipe(
      Given('a .claude/CLAUDE.md with a @-ref and no root CLAUDE.md')('ctx', () => Effect.succeed({ cwd: '/test' })),
      When('ReferencedContent.load is called')('result', (s) =>
        Effect.gen(function*() {
          const rc = yield* ReferencedContent
          return yield* rc.load(s.ctx.cwd)
        })),
      Then('result should include the .claude ref content despite the concurrent miss')((s) =>
        Effect.sync(() => {
          expect(s.result).toContain('.claude rules content')
        })
      ),
    ),
  )

  scenario(
    'Should merge refs from both CLAUDE.md files concurrently',
    {
      scenarioLayer: makeLayer({
        '/test/CLAUDE.md': '@rules/a.md\n',
        '/test/.claude/CLAUDE.md': '@.claude/b.md\n',
        '/test/rules/a.md': 'A content',
        '/test/.claude/b.md': 'B content',
      }),
    },
    Gherkin.Do.pipe(
      Given('both CLAUDE.md files with distinct refs')('ctx', () => Effect.succeed({ cwd: '/test' })),
      When('ReferencedContent.load is called')('result', (s) =>
        Effect.gen(function*() {
          const rc = yield* ReferencedContent
          return yield* rc.load(s.ctx.cwd)
        })),
      Then('result should include both refs')((s) =>
        Effect.sync(() => {
          expect(s.result).toContain('A content')
          expect(s.result).toContain('B content')
        })
      ),
    ),
  )

  scenario(
    'Should dedupe the same resolved path appearing in both CLAUDE.md files',
    {
      scenarioLayer: makeLayer({
        '/test/CLAUDE.md': '@shared.md\n',
        '/test/.claude/CLAUDE.md': '@shared.md\n',
        '/test/shared.md': 'Shared content',
      }),
    },
    Gherkin.Do.pipe(
      Given('both CLAUDE.md files referencing the same file')('ctx', () => Effect.succeed({ cwd: '/test' })),
      When('ReferencedContent.load is called')('result', (s) =>
        Effect.gen(function*() {
          const rc = yield* ReferencedContent
          return yield* rc.load(s.ctx.cwd)
        })),
      Then('shared content should appear exactly once')((s) =>
        Effect.sync(() => {
          const occurrences = (s.result.match(/Shared content/g) ?? []).length
          expect(occurrences).toBe(1)
        })
      ),
    ),
  )

  scenario(
    'Should fall back to project root when baseDir resolution is not confined or missing',
    {
      scenarioLayer: makeLayer({
        '/test/.claude/CLAUDE.md': '@shared.md\n',
        '/test/shared.md': 'Root shared content',
      }),
    },
    Gherkin.Do.pipe(
      Given('a .claude/CLAUDE.md referencing a file that exists only at the project root')(
        'ctx',
        () => Effect.succeed({ cwd: '/test' }),
      ),
      When('ReferencedContent.load is called')('result', (s) =>
        Effect.gen(function*() {
          const rc = yield* ReferencedContent
          return yield* rc.load(s.ctx.cwd)
        })),
      Then('result should resolve via root fallback and include the content')((s) =>
        Effect.sync(() => {
          expect(s.result).toContain('Root shared content')
        })
      ),
    ),
  )

  scenario(
    'Should skip an unreadable ref target without leaking an error into the prompt',
    {
      scenarioLayer: makeLayer({
        '/test/CLAUDE.md': '@refdir\n@docs/style.md\n',
        '/test/refdir/inner.md': 'unreachable through a directory read',
        '/test/docs/style.md': 'Tabs, not spaces.',
      }),
    },
    Gherkin.Do.pipe(
      Given('a ref resolving to a directory and a readable ref')('ctx', () => Effect.succeed({ cwd: '/test' })),
      When('ReferencedContent.load is called')('result', (s) =>
        Effect.gen(function*() {
          const rc = yield* ReferencedContent
          return yield* rc.load(s.ctx.cwd)
        })),
      Then('no error placeholder appears and the readable ref still injects')((s) =>
        Effect.sync(() => {
          expect(s.result).not.toContain('[error reading')
          expect(s.result).not.toContain('## refdir')
          expect(s.result).toContain('Tabs, not spaces.')
        })
      ),
    ),
  )

  scenario(
    'Should still inject a ref outside the default skip list',
    {
      scenarioLayer: makeLayer({
        '/test/CLAUDE.md': '@docs/style.md\n',
        '/test/docs/style.md': 'Tabs, not spaces.',
      }),
    },
    Gherkin.Do.pipe(
      Given('a CLAUDE.md referencing docs/style.md')('ctx', () => Effect.succeed({ cwd: '/test' })),
      When('ReferencedContent.load is called')('result', (s) =>
        Effect.gen(function*() {
          const rc = yield* ReferencedContent
          return yield* rc.load(s.ctx.cwd)
        })),
      Then('the style guidance should be injected')((s) =>
        Effect.sync(() => {
          expect(s.result).toContain('Tabs, not spaces.')
        })
      ),
    ),
  )

  scenario(
    'Should suppress a skip-listed ref whatever its content',
    {
      scenarioLayer: makeLayer({
        '/test/CLAUDE.md': '@AGENTS.md\n',
        '/test/AGENTS.md': '| Concern | Tool |\n| ------- | ---- |\n| Pkg     | pnpm |',
      }),
    },
    Gherkin.Do.pipe(
      Given('an AGENTS.md the host would render')('ctx', () => Effect.succeed({ cwd: '/test' })),
      When('ReferencedContent.load runs with default skip list')('result', (s) =>
        Effect.gen(function*() {
          const rc = yield* ReferencedContent
          return yield* rc.load(s.ctx.cwd)
        })),
      Then('nothing should be injected')((s) =>
        Effect.sync(() => {
          expect(s.result).toBe('')
        })
      ),
    ),
  )

  scenario(
    'Should replace the default skip list with a configured one',
    {
      scenarioLayer: makeLayer({
        '/test/systemfsoftware.toml': 'no_inject_refs = ["CUSTOM.md"]\n',
        '/test/CLAUDE.md': '@CUSTOM.md\n@AGENTS.md\n',
        '/test/CUSTOM.md': 'Custom rules.',
        '/test/AGENTS.md': '# Project Rules\n\nUse pnpm only.',
      }),
    },
    Gherkin.Do.pipe(
      Given('a project config naming CUSTOM.md instead of AGENTS.md')('ctx', () => Effect.succeed({ cwd: '/test' })),
      When('ReferencedContent.load runs')('result', (s) =>
        Effect.gen(function*() {
          const rc = yield* ReferencedContent
          return yield* rc.load(s.ctx.cwd)
        })),
      Then('the configured name is suppressed and AGENTS.md injected')((s) =>
        Effect.sync(() => {
          expect(s.result).not.toContain('Custom rules.')
          expect(s.result).toContain('Use pnpm only.')
        })
      ),
    ),
  )

  scenario(
    'Should read no_inject_refs alongside an unrelated config key',
    {
      scenarioLayer: makeLayer({
        '/test/systemfsoftware.toml': 'no_delegate_skills = ["lfg"]\nno_inject_refs = ["CUSTOM.md"]\n',
        '/test/CLAUDE.md': '@CUSTOM.md\n@AGENTS.md\n',
        '/test/CUSTOM.md': 'Custom rules.',
        '/test/AGENTS.md': '# Project Rules\n\nUse pnpm only.',
      }),
    },
    Gherkin.Do.pipe(
      Given('a config carrying both no_delegate_skills and no_inject_refs')(
        'ctx',
        () => Effect.succeed({ cwd: '/test' }),
      ),
      When('ReferencedContent.load runs')('result', (s) =>
        Effect.gen(function*() {
          const rc = yield* ReferencedContent
          return yield* rc.load(s.ctx.cwd)
        })),
      Then('both keys decode and the configured name is suppressed')((s) =>
        Effect.sync(() => {
          expect(s.result).not.toContain('Custom rules.')
          expect(s.result).toContain('Use pnpm only.')
        })
      ),
    ),
  )

  scenario(
    'Should return one injected section when one ref read fails concurrently',
    {
      scenarioLayer: makeLayer({
        '/test/CLAUDE.md': '@ok.md\n@missing.md\n',
        '/test/ok.md': 'OK content',
      }),
    },
    Gherkin.Do.pipe(
      Given('a CLAUDE.md with one readable and one missing ref read concurrently')(
        'ctx',
        () => Effect.succeed({ cwd: '/test' }),
      ),
      When('ReferencedContent.load runs')('result', (s) =>
        Effect.gen(function*() {
          const rc = yield* ReferencedContent
          return yield* rc.load(s.ctx.cwd)
        })),
      Then('the readable ref still injects and no error placeholder appears')((s) =>
        Effect.sync(() => {
          expect(s.result).toContain('OK content')
          expect(s.result).not.toContain('[error reading')
          expect(s.result).not.toContain('missing.md')
        })
      ),
    ),
  )
})
