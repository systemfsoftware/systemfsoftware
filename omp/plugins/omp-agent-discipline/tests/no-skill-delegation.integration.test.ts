import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { TomlLoaderLive } from '@systemfsoftware/omp-utils'
import { Effect, Layer } from 'effect'
import * as PathModule from 'effect/Path'
import { expect } from 'vitest'
import { runNoSkillDelegation } from '../src/NoSkillDelegationExecutor.js'

function present<A>(value: A | null | undefined): A {
  if (value === null || value === undefined) throw new Error('expected a value, got none')
  return value
}

const Feature = makeFeature({ it, layer })

function seededLayer(contents: Record<string, string>) {
  return TomlLoaderLive.pipe(
    Layer.provide(MemoryFileSystem.layerWith(contents)),
    Layer.provide(PathModule.layer),
  )
}

function tomlConfig(skills: readonly string[]) {
  const list = skills.map((s) => `"${s}"`).join(', ')
  return { '/test/systemfsoftware.toml': `no_delegate_skills = [${list}]` }
}

Feature('No-skill-delegation — executor integration')
  .body(({ scenario }) => {
    scenario(
      'Should allow dispatch from an unknown cwd (no guard compiled)',
      { scenarioLayer: seededLayer(tomlConfig(['ce-work'])) },
      Gherkin.Do.pipe(
        Given('a toml config at /test')('cwd', () => Effect.succeed('/unknown')),
        When('runNoSkillDelegation is called for /unknown')(
          'result',
          (s) => runNoSkillDelegation(s.cwd, 'task', '', 'spawn a task with ce-work'),
        ),
        Then('it should return undefined')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Should block a delegated prompt in a configured cwd',
      { scenarioLayer: seededLayer(tomlConfig(['ce-work'])) },
      Gherkin.Do.pipe(
        Given('a toml config at /test')('cwd', () => Effect.succeed('/test')),
        When('runNoSkillDelegation is called for /test')(
          'result',
          (s) => runNoSkillDelegation(s.cwd, 'task', '', 'spawn a task with ce-work'),
        ),
        Then('the block result protects ce-work')((s) =>
          Effect.sync(() => {
            expect(s.result).not.toBeUndefined()
            expect(present(s.result).block).toBe(true)
            expect(present(s.result).skill).toBe('ce-work')
          })
        ),
      ),
    )

    scenario(
      'Should fail open when toml is malformed',
      {
        scenarioLayer: seededLayer({
          '/test/systemfsoftware.toml': 'invalid toml [[[',
        }),
      },
      Gherkin.Do.pipe(
        Given('a malformed toml file')('cwd', () => Effect.succeed('/test')),
        When('runNoSkillDelegation is called')(
          'result',
          (s) => runNoSkillDelegation(s.cwd, 'task', '', 'spawn a task with ce-work'),
        ),
        Then('it should return undefined (fail open)')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Should block a delegated prompt through the executor',
      { scenarioLayer: seededLayer(tomlConfig(['ce-work'])) },
      Gherkin.Do.pipe(
        Given('a toml config at /test')(
          'ctx',
          () =>
            Effect.succeed({ cwd: '/test', toolName: 'task', subagentType: '', prompt: 'spawn a task with ce-work' }),
        ),
        When('runNoSkillDelegation is called')(
          'result',
          (s) => runNoSkillDelegation(s.ctx.cwd, s.ctx.toolName, s.ctx.subagentType, s.ctx.prompt),
        ),
        Then('it should return a block result')((s) =>
          Effect.sync(() => {
            expect(s.result).not.toBeUndefined()
            expect(present(s.result).block).toBe(true)
            expect(present(s.result).skill).toBe('ce-work')
            expect(present(s.result).how).toBe('prompt')
          })
        ),
      ),
    )

    scenario(
      'Should allow a reference prompt through the executor',
      { scenarioLayer: seededLayer(tomlConfig(['ce-work'])) },
      Gherkin.Do.pipe(
        Given('a toml config at /test')(
          'ctx',
          () => Effect.succeed({ cwd: '/test', toolName: 'task', subagentType: '', prompt: 'see the ce-work skill' }),
        ),
        When('runNoSkillDelegation is called')(
          'result',
          (s) => runNoSkillDelegation(s.ctx.cwd, s.ctx.toolName, s.ctx.subagentType, s.ctx.prompt),
        ),
        Then('it should return undefined')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Should have independent verdicts for different cwds',
      Gherkin.Do.pipe(
        Given('a filesystem with toml at /project-a but not /project-b')('dirs', () =>
          Effect.succeed({
            layer: TomlLoaderLive.pipe(
              Layer.provide(MemoryFileSystem.layerWith({
                '/project-a/systemfsoftware.toml': 'no_delegate_skills = ["ce-work"]',
              })),
              Layer.provide(PathModule.layer),
            ),
          })),
        When('runNoSkillDelegation is called for both directories')(
          'results',
          (s) =>
            runNoSkillDelegation('/project-a', 'task', '', 'spawn a task with ce-work').pipe(
              Effect.provide(s.dirs.layer),
              Effect.flatMap((a) =>
                runNoSkillDelegation('/project-b', 'task', '', 'spawn a task with ce-work').pipe(
                  Effect.provide(s.dirs.layer),
                  Effect.map((b) => ({ a, b })),
                )
              ),
            ),
        ),
        Then('project-a should block and project-b should allow')((s) =>
          Effect.sync(() => {
            expect(s.results.a).not.toBeUndefined()
            expect(present(s.results.a).skill).toBe('ce-work')
            expect(s.results.b).toBeUndefined()
          })
        ),
      ),
    )
  })
