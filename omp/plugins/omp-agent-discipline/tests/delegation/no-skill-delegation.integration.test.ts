import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import { NoDelegateSkills } from '../../src/delegation/config.js'
import { runNoSkillDelegation } from '../../src/delegation/mod.js'

function present<A>(value: A | null | undefined): A {
  if (value === null || value === undefined) throw new Error('expected a value, got none')
  return value
}

const Feature = makeFeature({ it, layer })

function seededLayer(contents: Record<string, string>) {
  const toml = contents['/test/systemfsoftware.toml'] ?? ''
  const malformed = toml.includes('invalid toml')
  const hasSkill = !malformed && toml.includes('ce-work')
  const skills: readonly string[] = malformed ? [] : hasSkill ? ['ce-work'] : []
  const fake = Layer.succeed(NoDelegateSkills, {
    get: (cwd: string) => (cwd === '/test' ? skills : []),
    set: () => {},
    load: (cwd: string) => Effect.succeed(cwd === '/test' ? skills : []),
  })
  return Layer.mergeAll(fake, MemoryFileSystem.layerWith({}))
}

function tomlConfig(skills: readonly string[]) {
  const list = skills.map((s) => `"${s}"`).join(', ')
  return { '/test/systemfsoftware.toml': `no_delegate_skills = [${list}]` }
}

Feature('No-skill-delegation — executor integration')
  .body(({ scenario }) => {
    scenario(
      'Dispatch from an unknown working directory is allowed when no guard is compiled',
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
      'A delegated prompt is blocked in a configured working directory',
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
      'A malformed TOML file fails open',
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
      'A delegated prompt is blocked through the executor',
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
      'A reference prompt passes through the executor',
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
      'Two working directories receive independent delegation verdicts',
      Gherkin.Do.pipe(
        Given('a filesystem with toml at /project-a but not /project-b')('dirs', () =>
          Effect.succeed({
            layer: Layer.mergeAll(
              Layer.succeed(NoDelegateSkills, {
                get: (cwd: string) => (cwd === '/project-a' ? (['ce-work'] as const) : []),
                set: () => {},
                load: (cwd: string) => Effect.succeed(cwd === '/project-a' ? (['ce-work'] as const) : [] as const),
              }),
              MemoryFileSystem.layerWith({}),
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
