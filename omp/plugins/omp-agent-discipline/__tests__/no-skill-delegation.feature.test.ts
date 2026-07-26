import * as PathModule from '@effect/platform/Path'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { TomlLoaderLive } from '@systemfsoftware/omp-utils'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import { loadGuard, runNoSkillDelegation } from '../src/no-skill-delegation.executor.js'

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
      'Should return null for an unknown cwd',
      { scenarioLayer: seededLayer(tomlConfig(['ce-work'])) },
      Gherkin.Do.pipe(
        Given('a toml config at /test')('cwd', () => Effect.succeed('/unknown')),
        When('loadGuard is called for /unknown')('guard', (s) => loadGuard(s.cwd)),
        Then('it should return null')((s) =>
          Effect.sync(() => {
            expect(s.guard).toBeNull()
          })
        ),
      ),
    )

    scenario(
      'Should load a guard from a configured cwd',
      { scenarioLayer: seededLayer(tomlConfig(['ce-work'])) },
      Gherkin.Do.pipe(
        Given('a toml config at /test')('cwd', () => Effect.succeed('/test')),
        When('loadGuard is called for /test')('guard', (s) => loadGuard(s.cwd)),
        Then('the guard should protect ce-work')((s) =>
          Effect.sync(() => {
            expect(s.guard).not.toBeNull()
            expect(s.guard!.protectedSkills).toEqual(['ce-work'])
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
        When('loadGuard is called')('guard', (s) => loadGuard(s.cwd)),
        Then('the guard should be null (fail open)')((s) =>
          Effect.sync(() => {
            expect(s.guard).toBeNull()
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
            expect(s.result!.block).toBe(true)
            expect(s.result!.skill).toBe('ce-work')
            expect(s.result!.how).toBe('prompt')
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
      'Should have independent guards for different cwds',
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
        When('loadGuard is called for both directories')('guards', (s) =>
          loadGuard('/project-a').pipe(
            Effect.provide(s.dirs.layer),
            Effect.flatMap((a) =>
              loadGuard('/project-b').pipe(
                Effect.provide(s.dirs.layer),
                Effect.map((b) => ({ a, b })),
              )
            ),
          )),
        Then('project-a should have a guard and project-b should not')((s) =>
          Effect.sync(() => {
            expect(s.guards.a).not.toBeNull()
            expect(s.guards.a!.protectedSkills).toEqual(['ce-work'])
            expect(s.guards.b).toBeNull()
          })
        ),
      ),
    )
  })
