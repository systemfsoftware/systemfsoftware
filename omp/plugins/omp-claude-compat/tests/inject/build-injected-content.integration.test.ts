import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'
import { buildInjectedContent } from '../../src/inject/referenced-content.js'

const Feature = makeFeature({ it, layer })

Feature('buildInjectedContent pure formatter').body(({ scenario }) => {
  scenario(
    'Should format single ref into injected markdown',
    Gherkin.Do.pipe(
      Given('a projectDir and one resolved ref with content')('ctx', () =>
        Effect.succeed({
          projectDir: '/test',
          refs: [{ sourcePath: '/test', resolvedPath: '/test/rules/a.md' }] as const,
          contents: { '/test/rules/a.md': '# A' } as const,
          skip: [] as const,
        })),
      When('buildInjectedContent is called')(
        'result',
        (s) => Effect.succeed(buildInjectedContent(s.ctx.projectDir, s.ctx.refs, s.ctx.contents, s.ctx.skip)),
      ),
      Then('result should contain header and ref section')((s) =>
        Effect.sync(() => {
          expect(s.result).toContain('# Injected @-references from CLAUDE.md')
          expect(s.result).toContain('## rules/a.md')
          expect(s.result).toContain('# A')
        })
      ),
    ),
  )

  scenario(
    'Should skip refs listed in skipList',
    Gherkin.Do.pipe(
      Given('a ref whose relative path is in skipList')('ctx', () =>
        Effect.succeed({
          projectDir: '/test',
          refs: [{ sourcePath: '/test', resolvedPath: '/test/AGENTS.md' }] as const,
          contents: { '/test/AGENTS.md': 'should be skipped' } as const,
          skip: ['AGENTS.md'] as const,
        })),
      When('buildInjectedContent is called')(
        'result',
        (s) => Effect.succeed(buildInjectedContent(s.ctx.projectDir, s.ctx.refs, s.ctx.contents, s.ctx.skip)),
      ),
      Then('result should be empty')((s) =>
        Effect.sync(() => {
          expect(s.result).toBe('')
        })
      ),
    ),
  )

  scenario(
    'Should return empty when ref content missing from map',
    Gherkin.Do.pipe(
      Given('a ref with no entry in refContents')('ctx', () =>
        Effect.succeed({
          projectDir: '/test',
          refs: [{ sourcePath: '/test', resolvedPath: '/test/missing.md' }] as const,
          contents: {},
          skip: [] as const,
        })),
      When('buildInjectedContent is called')(
        'result',
        (s) => Effect.succeed(buildInjectedContent(s.ctx.projectDir, s.ctx.refs, s.ctx.contents, s.ctx.skip)),
      ),
      Then('result should be empty')((s) =>
        Effect.sync(() => {
          expect(s.result).toBe('')
        })
      ),
    ),
  )
})
