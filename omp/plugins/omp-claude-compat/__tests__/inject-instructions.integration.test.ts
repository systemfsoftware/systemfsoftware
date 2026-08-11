import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Contents, layer as memoryFileSystemLayer } from '@systemfsoftware/effect-memfs'
import { TomlLoader, TomlLoaderLive } from '@systemfsoftware/omp-utils/toml-loader'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import { InjectInstructionsExecutorDeps, loadReferencedContent } from '../src/inject-instructions.executor.js'

const Feature = makeFeature({ it, layer })

function makeFsLayer(contents: Record<string, string>) {
  return Layer.effect(
    InjectInstructionsExecutorDeps,
    Effect.gen(function*() {
      const fileSystem = yield* FileSystem
      const path = yield* PathModule.Path
      const tomlLoader = yield* TomlLoader
      return { fileSystem, path, tomlLoader }
    }),
  ).pipe(
    Layer.provideMerge(
      TomlLoaderLive.pipe(
        Layer.provideMerge(
          memoryFileSystemLayer.pipe(
            Layer.provide(Layer.succeed(Contents, contents)),
            Layer.provideMerge(PathModule.layer),
          ),
        ),
      ),
    ),
  )
}

Feature('@-ref extraction, resolution, and injection').body(({ scenario }) => {
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

  // ── Rule: a ref the host discovers on its own is not injected again ──

  scenario(
    'Should suppress a skip-listed ref whatever its content',
    {
      scenarioLayer: makeFsLayer({
        '/test/CLAUDE.md': '@AGENTS.md\n',
        '/test/AGENTS.md': '| Concern | Tool |\n| ------- | ---- |\n| Pkg     | pnpm |',
      }),
    },
    Gherkin.Do.pipe(
      Given('an AGENTS.md the host would render with different table spacing')(
        'dir',
        () => Effect.succeed('/test'),
      ),
      When('loadReferencedContent runs with no project config')(
        'result',
        (s) => loadReferencedContent(s.dir),
      ),
      Then('nothing should be injected')((s) =>
        Effect.sync(() => {
          expect(s.result).toBe('')
        })
      ),
    ),
  )

  scenario(
    'Should still inject a ref outside the skip list',
    {
      scenarioLayer: makeFsLayer({
        '/test/CLAUDE.md': '@docs/style.md\n',
        '/test/docs/style.md': 'Tabs, not spaces.',
      }),
    },
    Gherkin.Do.pipe(
      Given('a CLAUDE.md referencing docs/style.md')('dir', () => Effect.succeed('/test')),
      When('loadReferencedContent runs')('result', (s) => loadReferencedContent(s.dir)),
      Then('the style guidance should be injected')((s) =>
        Effect.sync(() => {
          expect(s.result).toContain('Tabs, not spaces.')
        })
      ),
    ),
  )

  scenario(
    'Should inject only the refs outside the skip list',
    {
      scenarioLayer: makeFsLayer({
        '/test/CLAUDE.md': '@AGENTS.md\n@docs/style.md\n',
        '/test/AGENTS.md': '# Project Rules\n\nUse pnpm only.',
        '/test/docs/style.md': 'Tabs, not spaces.',
      }),
    },
    Gherkin.Do.pipe(
      Given('a CLAUDE.md referencing both AGENTS.md and docs/style.md')(
        'dir',
        () => Effect.succeed('/test'),
      ),
      When('loadReferencedContent runs')('result', (s) => loadReferencedContent(s.dir)),
      Then('only the style guide should be injected')((s) =>
        Effect.sync(() => {
          expect(s.result).toContain('Tabs, not spaces.')
          expect(s.result).not.toContain('Use pnpm only.')
        })
      ),
    ),
  )

  scenario(
    'Should replace the default skip list with a configured one',
    {
      scenarioLayer: makeFsLayer({
        '/test/systemfsoftware.toml': 'no_inject_refs = ["CUSTOM.md"]\n',
        '/test/CLAUDE.md': '@CUSTOM.md\n@AGENTS.md\n',
        '/test/CUSTOM.md': 'Custom rules.',
        '/test/AGENTS.md': '# Project Rules\n\nUse pnpm only.',
      }),
    },
    Gherkin.Do.pipe(
      Given('a project config naming CUSTOM.md instead of AGENTS.md')(
        'dir',
        () => Effect.succeed('/test'),
      ),
      When('loadReferencedContent runs')('result', (s) => loadReferencedContent(s.dir)),
      Then('the configured name is suppressed and AGENTS.md injected')((s) =>
        Effect.sync(() => {
          expect(s.result).not.toContain('Custom rules.')
          expect(s.result).toContain('Use pnpm only.')
        })
      ),
    ),
  )

  scenario(
    'Should disable suppression entirely on an empty skip list',
    {
      scenarioLayer: makeFsLayer({
        '/test/systemfsoftware.toml': 'no_inject_refs = []\n',
        '/test/CLAUDE.md': '@AGENTS.md\n',
        '/test/AGENTS.md': '# Project Rules\n\nUse pnpm only.',
      }),
    },
    Gherkin.Do.pipe(
      Given('a project config with an empty no_inject_refs')(
        'dir',
        () => Effect.succeed('/test'),
      ),
      When('loadReferencedContent runs')('result', (s) => loadReferencedContent(s.dir)),
      Then('AGENTS.md should be injected')((s) =>
        Effect.sync(() => {
          expect(s.result).toContain('Use pnpm only.')
        })
      ),
    ),
  )

  scenario(
    'Should fall back to the default skip list on a malformed config',
    {
      scenarioLayer: makeFsLayer({
        '/test/systemfsoftware.toml': 'no_inject_refs = "AGENTS.md"\n',
        '/test/CLAUDE.md': '@AGENTS.md\n',
        '/test/AGENTS.md': '# Project Rules\n\nUse pnpm only.',
      }),
    },
    Gherkin.Do.pipe(
      Given('a config whose no_inject_refs is a scalar, not an array')(
        'dir',
        () => Effect.succeed('/test'),
      ),
      When('loadReferencedContent runs')('result', (s) => loadReferencedContent(s.dir)),
      Then('the default skip list should still suppress AGENTS.md')((s) =>
        Effect.sync(() => {
          expect(s.result).toBe('')
        })
      ),
    ),
  )

  scenario(
    'Should list an empty ref file that is not suppressed',
    {
      scenarioLayer: makeFsLayer({
        '/test/CLAUDE.md': '@placeholder.md\n',
        '/test/placeholder.md': '',
      }),
    },
    Gherkin.Do.pipe(
      Given('a CLAUDE.md referencing an empty placeholder')(
        'dir',
        () => Effect.succeed('/test'),
      ),
      When('loadReferencedContent runs')('result', (s) => loadReferencedContent(s.dir)),
      Then('the placeholder should still be listed')((s) =>
        Effect.sync(() => {
          expect(s.result).toContain('## placeholder.md')
        })
      ),
    ),
  )

  scenario(
    'Should inject a nested AGENTS.md while the root stays deduplicated',
    {
      scenarioLayer: makeFsLayer({
        '/test/CLAUDE.md': '@AGENTS.md\n@docs/AGENTS.md\n',
        '/test/AGENTS.md': '# Root rules\n\nRoot text.',
        '/test/docs/AGENTS.md': '# Nested rules\n\nUse pnpm only.',
      }),
    },
    Gherkin.Do.pipe(
      Given('a CLAUDE.md referencing both the root and a nested AGENTS.md')(
        'dir',
        () => Effect.succeed('/test'),
      ),
      When('loadReferencedContent runs')('result', (s) => loadReferencedContent(s.dir)),
      Then('only the root path is suppressed, the nested one injects')((s) =>
        Effect.sync(() => {
          expect(s.result).not.toContain('Root text.')
          expect(s.result).toContain('## docs/AGENTS.md')
          expect(s.result).toContain('Use pnpm only.')
        })
      ),
    ),
  )

  scenario(
    'Should skip an unreadable ref target without leaking an error into the prompt',
    {
      scenarioLayer: makeFsLayer({
        '/test/CLAUDE.md': '@refdir\n@docs/style.md\n',
        '/test/refdir/inner.md': 'unreachable through a directory read',
        '/test/docs/style.md': 'Tabs, not spaces.',
      }),
    },
    Gherkin.Do.pipe(
      Given('a ref resolving to a directory rather than a readable file')(
        'dir',
        () => Effect.succeed('/test'),
      ),
      When('loadReferencedContent runs')('result', (s) => loadReferencedContent(s.dir)),
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
    'Should read no_inject_refs alongside an unrelated config key',
    {
      scenarioLayer: makeFsLayer({
        '/test/systemfsoftware.toml': 'no_delegate_skills = ["lfg"]\nno_inject_refs = ["CUSTOM.md"]\n',
        '/test/CLAUDE.md': '@CUSTOM.md\n@AGENTS.md\n',
        '/test/CUSTOM.md': 'Custom rules.',
        '/test/AGENTS.md': '# Project Rules\n\nUse pnpm only.',
      }),
    },
    Gherkin.Do.pipe(
      Given('a config carrying both no_delegate_skills and no_inject_refs')(
        'dir',
        () => Effect.succeed('/test'),
      ),
      When('loadReferencedContent runs')('result', (s) => loadReferencedContent(s.dir)),
      Then('both keys decode and the configured name is suppressed')((s) =>
        Effect.sync(() => {
          expect(s.result).not.toContain('Custom rules.')
          expect(s.result).toContain('Use pnpm only.')
        })
      ),
    ),
  )

  scenario(
    'Should void every config key when one value is malformed',
    {
      scenarioLayer: makeFsLayer({
        '/test/systemfsoftware.toml': 'no_delegate_skills = ["lfg"]\nno_inject_refs = "AGENTS.md"\n',
      }),
    },
    Gherkin.Do.pipe(
      Given('a config whose no_inject_refs is a scalar, not an array')(
        'dir',
        () => Effect.succeed('/test'),
      ),
      When('the shared loader reads that config')(
        'config',
        (s) =>
          Effect.gen(function*() {
            const loader = yield* TomlLoader
            return yield* loader.load(s.dir)
          }),
      ),
      Then('the unrelated no_delegate_skills key is voided along with it')((s) =>
        Effect.sync(() => {
          expect(s.config['no_inject_refs']).toBeUndefined()
          expect(s.config['no_delegate_skills']).toBeUndefined()
        })
      ),
    ),
  )
})
