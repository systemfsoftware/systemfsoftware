import * as PathModule from '@effect/platform/Path'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import { loadReferencedContent } from '../src/inject-instructions.executor.js'

const Feature = makeFeature({ it, layer })

function makeFsLayer(contents: Record<string, string>) {
  return MemoryFileSystem.layerWith(contents).pipe(
    Layer.provideMerge(PathModule.layer),
  )
}

Feature('@-ref extraction, resolution, and injection')
  .body(({ scenario }) => {
    // ── Basic ref extraction ──

    scenario(
      'Should extract plain @-refs from CLAUDE.md',
      {
        scenarioLayer: makeFsLayer({
          '/test/CLAUDE.md': '@rules/typescript.md\n',
          '/test/rules/typescript.md': '# TypeScript Rules\n\nUse strict mode.',
        }),
      },
      Gherkin.Do.pipe(
        Given('a CLAUDE.md with a plain @-ref')('dir', () => Effect.succeed('/test')),
        When('loadReferencedContent is called')('result', (s) => loadReferencedContent(s.dir)),
        Then('the result should include the referenced file content')((s) =>
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
        scenarioLayer: makeFsLayer({
          '/test/CLAUDE.md': '- @rules/lint.md\n',
          '/test/rules/lint.md': 'Lint rules content',
        }),
      },
      Gherkin.Do.pipe(
        Given('a CLAUDE.md with a dash-prefixed @-ref')('dir', () => Effect.succeed('/test')),
        When('loadReferencedContent is called')('result', (s) => loadReferencedContent(s.dir)),
        Then('the result should include the referenced content')((s) =>
          Effect.sync(() => {
            expect(s.result).toContain('Lint rules content')
          })
        ),
      ),
    )

    scenario(
      'Should extract refs when star and plus markers are used',
      {
        scenarioLayer: makeFsLayer({
          '/test/CLAUDE.md': '* @config/eslint.md\n\n+ @config/prettier.md\n',
          '/test/config/eslint.md': 'ESLint: error',
          '/test/config/prettier.md': 'Prettier: warn',
        }),
      },
      Gherkin.Do.pipe(
        Given('a CLAUDE.md with star and plus prefixed @-refs')('dir', () => Effect.succeed('/test')),
        When('loadReferencedContent is called')('result', (s) => loadReferencedContent(s.dir)),
        Then('the result should include both referenced files')((s) =>
          Effect.sync(() => {
            expect(s.result).toContain('ESLint: error')
            expect(s.result).toContain('Prettier: warn')
          })
        ),
      ),
    )

    // ── Security: missing file, path traversal, absolute path ──

    scenario(
      'Should skip missing referenced file',
      {
        scenarioLayer: makeFsLayer({
          '/test/CLAUDE.md': '@rules/missing.md\n',
        }),
      },
      Gherkin.Do.pipe(
        Given('a CLAUDE.md referencing a non-existent file')('dir', () => Effect.succeed('/test')),
        When('loadReferencedContent is called')('result', (s) => loadReferencedContent(s.dir)),
        Then('the result should be empty')((s) =>
          Effect.sync(() => {
            expect(s.result).toBe('')
          })
        ),
      ),
    )

    scenario(
      'Should reject absolute path refs starting with slash',
      {
        scenarioLayer: makeFsLayer({
          '/test/CLAUDE.md': '@/etc/passwd\n',
        }),
      },
      Gherkin.Do.pipe(
        Given('a CLAUDE.md with an absolute path @-ref')('dir', () => Effect.succeed('/test')),
        When('loadReferencedContent is called')('result', (s) => loadReferencedContent(s.dir)),
        Then('the result should be empty')((s) =>
          Effect.sync(() => {
            expect(s.result).toBe('')
          })
        ),
      ),
    )

    scenario(
      'Should reject path traversal refs with dot-dot',
      {
        scenarioLayer: makeFsLayer({
          '/test/CLAUDE.md': '@../outside.txt\n',
        }),
      },
      Gherkin.Do.pipe(
        Given('a CLAUDE.md with a dot-dot path traversal @-ref')('dir', () => Effect.succeed('/test')),
        When('loadReferencedContent is called')('result', (s) => loadReferencedContent(s.dir)),
        Then('the result should be empty')((s) =>
          Effect.sync(() => {
            expect(s.result).toBe('')
          })
        ),
      ),
    )

    scenario(
      'Should reject backtick refs with dot-dot traversal',
      {
        scenarioLayer: makeFsLayer({
          '/test/CLAUDE.md': '@../../etc/hosts\n',
        }),
      },
      Gherkin.Do.pipe(
        Given('a CLAUDE.md with a backtick-escaped path traversal')('dir', () => Effect.succeed('/test')),
        When('loadReferencedContent is called')('result', (s) => loadReferencedContent(s.dir)),
        Then('the result should be empty')((s) =>
          Effect.sync(() => {
            expect(s.result).toBe('')
          })
        ),
      ),
    )

    // ── Deep paths and multiple refs ──

    scenario(
      'Should resolve nested deep paths',
      {
        scenarioLayer: makeFsLayer({
          '/test/CLAUDE.md': '@nested/deep/rule.md\n',
          '/test/nested/deep/rule.md': 'Deep rule content',
        }),
      },
      Gherkin.Do.pipe(
        Given('a CLAUDE.md with a deeply nested @-ref')('dir', () => Effect.succeed('/test')),
        When('loadReferencedContent is called')('result', (s) => loadReferencedContent(s.dir)),
        Then('the result should include the deep content')((s) =>
          Effect.sync(() => {
            expect(s.result).toContain('Deep rule content')
          })
        ),
      ),
    )

    scenario(
      'Should merge multiple refs from CLAUDE.md',
      {
        scenarioLayer: makeFsLayer({
          '/test/CLAUDE.md': '@rules/style.md\n@rules/errors.md\n',
          '/test/rules/style.md': 'Style: tabs',
          '/test/rules/errors.md': 'Errors: strict',
        }),
      },
      Gherkin.Do.pipe(
        Given('a CLAUDE.md with multiple @-refs')('dir', () => Effect.succeed('/test')),
        When('loadReferencedContent is called')('result', (s) => loadReferencedContent(s.dir)),
        Then('the result should include both refs')((s) =>
          Effect.sync(() => {
            expect(s.result).toContain('Style: tabs')
            expect(s.result).toContain('Errors: strict')
          })
        ),
      ),
    )

    // ── Edge cases ──

    scenario(
      'Should return empty when no refs found',
      {
        scenarioLayer: makeFsLayer({
          '/test/CLAUDE.md': 'No refs in here\n',
        }),
      },
      Gherkin.Do.pipe(
        Given('a CLAUDE.md with no @-refs')('dir', () => Effect.succeed('/test')),
        When('loadReferencedContent is called')('result', (s) => loadReferencedContent(s.dir)),
        Then('the result should be empty')((s) =>
          Effect.sync(() => {
            expect(s.result).toBe('')
          })
        ),
      ),
    )

    scenario(
      'Should handle all @-ref formats simultaneously',
      {
        scenarioLayer: makeFsLayer({
          '/test/CLAUDE.md': '@relative.md\n@./explicit.md\n@rules/simple.md\n',
          '/test/relative.md': 'Relative',
          '/test/explicit.md': 'Explicit',
          '/test/rules/simple.md': 'Simple',
        }),
      },
      Gherkin.Do.pipe(
        Given('a CLAUDE.md with relative, explicit, and nested @-refs')('dir', () => Effect.succeed('/test')),
        When('loadReferencedContent is called')('result', (s) => loadReferencedContent(s.dir)),
        Then('the result should include all referenced content')((s) =>
          Effect.sync(() => {
            expect(s.result).toContain('Relative')
            expect(s.result).toContain('Explicit')
            expect(s.result).toContain('Simple')
          })
        ),
      ),
    )

    scenario(
      'Should return empty when CLAUDE.md is empty',
      {
        scenarioLayer: makeFsLayer({
          '/test/CLAUDE.md': '',
        }),
      },
      Gherkin.Do.pipe(
        Given('an empty CLAUDE.md')('dir', () => Effect.succeed('/test')),
        When('loadReferencedContent is called')('result', (s) => loadReferencedContent(s.dir)),
        Then('the result should be empty')((s) =>
          Effect.sync(() => {
            expect(s.result).toBe('')
          })
        ),
      ),
    )

    scenario(
      'Should load refs from .claude directory',
      {
        scenarioLayer: makeFsLayer({
          '/test/.claude/CLAUDE.md': '@.claude/rules.md\n',
          '/test/.claude/rules.md': '.claude rules content',
        }),
      },
      Gherkin.Do.pipe(
        Given('a CLAUDE.md in a .claude directory with @-refs')('dir', () => Effect.succeed('/test')),
        When('loadReferencedContent is called')('result', (s) => loadReferencedContent(s.dir)),
        Then('the result should include the .claude ref content')((s) =>
          Effect.sync(() => {
            expect(s.result).toContain('.claude rules content')
          })
        ),
      ),
    )
  })
