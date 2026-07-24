import * as PathModule from '@effect/platform/Path'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { TomlLoaderLive } from '@systemfsoftware/omp-utils'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import { loadGuard } from '../src/no-skill-delegation.handler.js'
import { GuardCacheLive } from '../src/runtime.js'

const Feature = makeFeature({ it, layer })

function seededLayer(contents: Record<string, string>) {
  return Layer.mergeAll(
    PathModule.layer,
    GuardCacheLive,
    TomlLoaderLive.pipe(
      Layer.provide(MemoryFileSystem.layerWith(contents)),
      Layer.provide(PathModule.layer),
    ),
  )
}

function tomlConfig(skills: readonly string[]) {
  const list = skills.map((s) => `"${s}"`).join(', ')
  return { '/test/systemfsoftware.toml': `no_delegate_skills = [${list}]` }
}

// ── Guard compilation ──

Feature('No-skill-delegation — guard compilation')
  .body(({ scenario }) => {
    scenario(
      'Should compile a guard for one skill',
      { scenarioLayer: seededLayer(tomlConfig(['ce-work'])) },
      Gherkin.Do.pipe(
        Given('a toml config listing one protected skill')('cwd', () => Effect.succeed('/test')),
        When('loadGuard is called')('guard', (s) => loadGuard(s.cwd)),
        Then('the guard should protect ce-work with 16 delegate and 4 reference verbs')((s) =>
          Effect.sync(() => {
            expect(s.guard).not.toBeNull()
            expect(s.guard!.protectedSkills).toEqual(new Set(['ce-work']))
            expect(s.guard!.delegationVerbs.length).toBe(16)
            expect(s.guard!.referenceVerbs.length).toBe(4)
          })
        ),
      ),
    )

    scenario(
      'Should compile a guard for multiple skills',
      { scenarioLayer: seededLayer(tomlConfig(['ce-work', 'ce-plan', 'lfg'])) },
      Gherkin.Do.pipe(
        Given('a toml config listing multiple protected skills')('cwd', () => Effect.succeed('/test')),
        When('loadGuard is called')('guard', (s) => loadGuard(s.cwd)),
        Then('the guard should protect all configured skills')((s) =>
          Effect.sync(() => {
            expect(s.guard).not.toBeNull()
            expect(s.guard!.protectedSkills).toEqual(new Set(['ce-work', 'ce-plan', 'lfg']))
          })
        ),
      ),
    )

    scenario(
      'Should return null when skills list is empty',
      { scenarioLayer: seededLayer(tomlConfig([])) },
      Gherkin.Do.pipe(
        Given('a toml config with an empty skills list')('cwd', () => Effect.succeed('/test')),
        When('loadGuard is called')('guard', (s) => loadGuard(s.cwd)),
        Then('the guard should be null')((s) =>
          Effect.sync(() => {
            expect(s.guard).toBeNull()
          })
        ),
      ),
    )

    scenario(
      'Should return null when toml file is missing',
      { scenarioLayer: seededLayer({}) },
      Gherkin.Do.pipe(
        Given('no toml config file exists')('cwd', () => Effect.succeed('/test')),
        When('loadGuard is called')('guard', (s) => loadGuard(s.cwd)),
        Then('the guard should be null')((s) =>
          Effect.sync(() => {
            expect(s.guard).toBeNull()
          })
        ),
      ),
    )

    scenario(
      'Should cache result by cwd when same directory loaded twice',
      { scenarioLayer: seededLayer(tomlConfig(['ce-work'])) },
      Gherkin.Do.pipe(
        Given('a toml config exists for /test')('cwd', () => Effect.succeed('/test')),
        When('loadGuard is called twice for the same cwd')(
          'guards',
          (s) => Effect.all([loadGuard(s.cwd), loadGuard(s.cwd)]),
        ),
        Then('both calls should return the same guard instance')((s) =>
          Effect.sync(() => {
            expect(s.guards[0]).toBe(s.guards[1])
          })
        ),
      ),
    )
  })

// ── Delegated verb matching ──

Feature('No-skill-delegation — delegated verb matching')
  .body(({ scenario }) => {
    scenario(
      'Should block prompt when delegation verb and skill mention match',
      { scenarioLayer: seededLayer(tomlConfig(['ce-work'])) },
      Gherkin.Do.pipe(
        Given('a guard protecting ce-work')('cwd', () => Effect.succeed('/test')),
        When('a prompt uses a delegation verb with ce-work')('matches', (s) =>
          loadGuard(s.cwd).pipe(
            Effect.flatMap((guard) => {
              const prompt = 'spawn a task with ce-work to implement feature X'
              const mentioned = [...guard!.mentionPatterns.entries()]
                .filter(([, p]) => p.test(prompt))
                .map(([n]) => n)
              return Effect.succeed({
                guard,
                prompt,
                mentioned,
                hasDelegation: guard!.delegationVerbs.some((re) => re.test(prompt)),
                hasReference: guard!.referenceVerbs.every((re) => !re.test(prompt)),
              })
            }),
          )),
        Then('the prompt should match a delegation verb and not a reference verb')((s) =>
          Effect.sync(() => {
            expect(s.matches.mentioned).toContain('ce-work')
            expect(s.matches.hasDelegation).toBe(true)
            expect(s.matches.hasReference).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Should block prompt when ce-plan with a delegation verb',
      { scenarioLayer: seededLayer(tomlConfig(['ce-work', 'ce-plan', 'lfg'])) },
      Gherkin.Do.pipe(
        Given('a guard protecting multiple skills')('cwd', () => Effect.succeed('/test')),
        When('a prompt uses a delegation verb with ce-plan')('matches', (s) =>
          loadGuard(s.cwd).pipe(
            Effect.flatMap((guard) => {
              const prompt = 'create a task using ce-plan'
              const mentioned = [...guard!.mentionPatterns.entries()]
                .filter(([, p]) => p.test(prompt))
                .map(([n]) => n)
              return Effect.succeed({
                guard,
                mentioned,
                hasDelegation: guard!.delegationVerbs.some((re) => re.test(prompt)),
              })
            }),
          )),
        Then('the prompt should be blocked by a delegation verb')((s) =>
          Effect.sync(() => {
            expect(s.matches.mentioned).toContain('ce-plan')
            expect(s.matches.hasDelegation).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Should pass prompt when only a reference verb is present',
      { scenarioLayer: seededLayer(tomlConfig(['ce-work'])) },
      Gherkin.Do.pipe(
        Given('a guard protecting ce-work')('cwd', () => Effect.succeed('/test')),
        When('a prompt uses only a reference verb with ce-work')('matches', (s) =>
          loadGuard(s.cwd).pipe(
            Effect.flatMap((guard) => {
              const prompt = 'see the ce-work skill for details'
              const mentioned = [...guard!.mentionPatterns.entries()]
                .filter(([, p]) => p.test(prompt))
                .map(([n]) => n)
              return Effect.succeed({
                guard,
                mentioned,
                hasReference: guard!.referenceVerbs.some((re) => re.test(prompt)),
                hasDelegation: guard!.delegationVerbs.every((re) => !re.test(prompt)),
              })
            }),
          )),
        Then('the prompt should match a reference verb only')((s) =>
          Effect.sync(() => {
            expect(s.matches.mentioned).toContain('ce-work')
            expect(s.matches.hasReference).toBe(true)
            expect(s.matches.hasDelegation).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Should block prompt with any delegation verb form',
      { scenarioLayer: seededLayer(tomlConfig(['ce-work'])) },
      Gherkin.Do.pipe(
        Given('a guard protecting ce-work')('cwd', () => Effect.succeed('/test')),
        When('various delegation verb forms are tested against the guard')('matches', (s) =>
          loadGuard(s.cwd).pipe(
            Effect.map((guard) => {
              const prompts = [
                '/ce-work will handle it',
                'use the ce-work skill',
                'load ce-work for this',
                'spawn a task with ce-work',
                'call ce-work to handle this',
                'send ce-work to do the job',
                'create a task using ce-work',
                'start ce-work on this',
              ]
              const results = prompts.map((p) => ({
                prompt: p,
                delegationHits: guard!.delegationVerbs.filter((re) => re.test(p)).length,
              }))
              return results
            }),
          )),
        Then('every prompt should match at least one delegation verb')((s) =>
          Effect.sync(() => {
            for (const r of s.matches) {
              expect(r.delegationHits).toBeGreaterThanOrEqual(1, `${r.prompt} should match a delegation verb`)
            }
          })
        ),
      ),
    )

    scenario(
      'Should pass prompt when skill mentioned without a delegation verb',
      { scenarioLayer: seededLayer(tomlConfig(['ce-work', 'ce-plan', 'lfg'])) },
      Gherkin.Do.pipe(
        Given('a guard with multiple protected skills')('cwd', () => Effect.succeed('/test')),
        When('a prompt mentions a skill without any delegation verb')('matches', (s) =>
          loadGuard(s.cwd).pipe(
            Effect.map((guard) => {
              const prompt = 'I already used lfg, it worked fine'
              const mentioned = [...guard!.mentionPatterns.entries()]
                .filter(([, p]) => p.test(prompt))
                .map(([n]) => n)
              const hasDelegation = guard!.delegationVerbs.every((re) => !re.test(prompt))
              return { mentioned, hasDelegation, guard }
            }),
          )),
        Then('it should not match a delegation verb')((s) =>
          Effect.sync(() => {
            expect(s.matches.mentioned).toContain('lfg')
            expect(s.matches.hasDelegation).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Should block prompt when backtick-wrapped skill with delegation verb',
      { scenarioLayer: seededLayer(tomlConfig(['ce-work'])) },
      Gherkin.Do.pipe(
        Given('a guard protecting ce-work')('cwd', () => Effect.succeed('/test')),
        When('a prompt has a backtick-wrapped ce-work with a delegation verb')('matches', (s) =>
          loadGuard(s.cwd).pipe(
            Effect.map((guard) => {
              const prompt = 'spawn a task with `ce-work`'
              return {
                mentionMatch: guard!.mentionPatterns.get('ce-work')!.test(prompt),
                hasDelegation: guard!.delegationVerbs.some((re) => re.test(prompt)),
              }
            }),
          )),
        Then('the mention and delegation verb should both match')((s) =>
          Effect.sync(() => {
            expect(s.matches.mentionMatch).toBe(true)
            expect(s.matches.hasDelegation).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Should pass prompt when backtick-wrapped skill with reference verb',
      { scenarioLayer: seededLayer(tomlConfig(['ce-work'])) },
      Gherkin.Do.pipe(
        Given('a guard protecting ce-work')('cwd', () => Effect.succeed('/test')),
        When('a prompt has a backtick-wrapped ce-work with a reference verb')('matches', (s) =>
          loadGuard(s.cwd).pipe(
            Effect.map((guard) => {
              const prompt = 'see the `ce-work` skill'
              return {
                mentionMatch: guard!.mentionPatterns.get('ce-work')!.test(prompt),
                hasReference: guard!.referenceVerbs.some((re) => re.test(prompt)),
                noDelegation: guard!.delegationVerbs.every((re) => !re.test(prompt)),
              }
            }),
          )),
        Then('the prompt should match a reference verb and not delegation')((s) =>
          Effect.sync(() => {
            expect(s.matches.mentionMatch).toBe(true)
            expect(s.matches.hasReference).toBe(true)
            expect(s.matches.noDelegation).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Should pass prompt when reference verb used for protected skill',
      { scenarioLayer: seededLayer(tomlConfig(['ce-work', 'ce-plan', 'lfg'])) },
      Gherkin.Do.pipe(
        Given('a guard protecting multiple skills')('cwd', () => Effect.succeed('/test')),
        When('a prompt uses a reference verb for ce-plan')('matches', (s) =>
          loadGuard(s.cwd).pipe(
            Effect.map((guard) => {
              const prompt = 'see the ce-plan skill'
              const mentioned = [...guard!.mentionPatterns.entries()]
                .filter(([, p]) => p.test(prompt))
                .map(([n]) => n)
              return {
                mentioned,
                noDelegation: guard!.delegationVerbs.every((re) => !re.test(prompt)),
                hasReference: guard!.referenceVerbs.some((re) => re.test(prompt)),
              }
            }),
          )),
        Then('it should match reference verb but not delegation')((s) =>
          Effect.sync(() => {
            expect(s.matches.mentioned).toContain('ce-plan')
            expect(s.matches.noDelegation).toBe(true)
            expect(s.matches.hasReference).toBe(true)
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
  })

// ── Mentions across cwds ──

Feature('No-skill-delegation — mentions across cwds')
  .body(({ scenario }) => {
    scenario(
      'Should return null for an unknown cwd',
      { scenarioLayer: seededLayer(tomlConfig(['ce-work'])) },
      Gherkin.Do.pipe(
        Given('a toml config at /test')('cwd', () => Effect.succeed('/unknown')),
        When('loadGuard is called for /unknown')(
          'guard',
          (s) => loadGuard(s.cwd),
        ),
        Then('it should return null')((s) =>
          Effect.sync(() => {
            expect(s.guard).toBeNull()
          })
        ),
      ),
    )

    scenario(
      'Should have independent guards for different cwds',
      Gherkin.Do.pipe(
        Given('a filesystem with toml at /project-a but not /project-b')('dirs', () =>
          Effect.succeed({
            layer: Layer.mergeAll(
              PathModule.layer,
              GuardCacheLive,
              TomlLoaderLive.pipe(
                Layer.provide(MemoryFileSystem.layerWith({
                  '/project-a/systemfsoftware.toml': 'no_delegate_skills = ["ce-work"]',
                })),
                Layer.provide(PathModule.layer),
              ),
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
            expect(s.guards.a!.protectedSkills.has('ce-work')).toBe(true)
            expect(s.guards.b).toBeNull()
          })
        ),
      ),
    )
  })
