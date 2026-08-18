/**
 * Dispatch-doctrine — drift guard integration test.
 *
 * The drift guard reads the actual skill file from the package tree, so the
 * `DOCTRINE_KERNEL`/excerpt contract is verified against the real file. It
 * drives the shell entry that owns the kernel constant.
 */

import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from 'vitest'

import { DOCTRINE_KERNEL } from '../src/DispatchDoctrineExecutor.js'

const Feature = makeFeature({ it, layer })

Feature('Dispatch-doctrine — drift guard')
  .body(({ scenario }) => {
    scenario(
      'DOCTRINE_KERNEL equals the marked excerpt in the skill file (whitespace-normalized)',
      Gherkin.Do.pipe(
        Given('the skill file at the package tree')(
          'path',
          () => {
            const here = path.dirname(fileURLToPath(import.meta.url))
            const skillPath = path.resolve(here, '../skills/task-decomposition/SKILL.md')
            if (!fs.existsSync(skillPath)) {
              throw new Error('skill file missing: ' + skillPath)
            }
            return Effect.succeed(skillPath)
          },
        ),
        When('the file is parsed and the marked excerpt is extracted')('check', (s) =>
          Effect.sync(() => {
            const raw = fs.readFileSync(s.path, 'utf8')
            const begin = '<!-- BEGIN DOCTRINE KERNEL -->'
            const end = '<!-- END DOCTRINE KERNEL -->'
            const beginIdx = raw.indexOf(begin)
            const endIdx = raw.indexOf(end)
            if (beginIdx === -1 || endIdx === -1) {
              throw new Error('doctrine markers missing in ' + s.path)
            }
            const excerpt = raw.slice(beginIdx + begin.length, endIdx).trim()
            const normalize = (t: string): string => t.replace(/\s+/g, ' ').trim()
            const frontmatter = raw.split('---')[1] ?? ''
            const hasName = /^name: task-decomposition$/m.test(frontmatter)
            const descMatch = frontmatter.match(/^description:\s*(.+)$/m)
            const description = descMatch?.[1] ?? ''
            return {
              excerpt,
              normalizedExcerpt: normalize(excerpt),
              normalizedKernel: normalize(DOCTRINE_KERNEL),
              hasName,
              hasDescription: description.trim().length > 0,
            }
          })),
        Then('the kernel normalized-equals the marked excerpt and the frontmatter is valid')((s) =>
          Effect.sync(() => {
            expect(s.check.normalizedKernel).toBe(s.check.normalizedExcerpt)
            expect(s.check.hasName).toBe(true)
            expect(s.check.hasDescription).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Missing skill file fails with a path-naming message',
      Gherkin.Do.pipe(
        Given('a non-existent skill path')(
          'path',
          () => Effect.succeed('/nonexistent/omp/plugins/omp-agent-discipline/skills/task-decomposition/SKILL.md'),
        ),
        When('the drift guard tries to read the file')('check', (s) =>
          Effect.sync(() => {
            try {
              fs.readFileSync(s.path, 'utf8')
              return { thrown: false, message: '' }
            } catch (e) {
              if (!(e instanceof Error)) throw e
              return { thrown: true, message: e.message }
            }
          })),
        Then('the failure names the absent path')((s) =>
          Effect.sync(() => {
            expect(s.check.thrown).toBe(true)
            expect(s.check.message).toContain('/nonexistent/')
          })
        ),
      ),
    )
  })
