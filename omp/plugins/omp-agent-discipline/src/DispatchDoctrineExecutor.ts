/**
 * Executor — I/O shell for the dispatch-doctrine gate.
 *
 * Read loads `dispatch_doctrine_skills`. Decode builds the command.
 * Decide is `checkDispatchDoctrine`. Encode maps the verdict to the
 * host gate. Write returns the check the handler caches.
 */
import { Cell } from '@systemfsoftware/effect-cell-types'
import { ProjectConfig } from '@systemfsoftware/omp-platform'
import type { TomlConfig } from '@systemfsoftware/omp-platform'
import { Effect, Match, pipe, Result } from 'effect'
import type { PlatformError } from 'effect/PlatformError'
import { extractSpecShape, matchesDoctrineSkillPath } from './DispatchDoctrine.js'
import {
  CheckDispatchCommand,
  checkDispatchDoctrine,
  type DispatchDoctrineImpossible,
  type DispatchDoctrineVerdict,
  DOCTRINE_KERNEL,
} from './DispatchDoctrine.workflow.js'

export { DOCTRINE_KERNEL }

export type DispatchGateResult = { readonly block: true; readonly reason: string } | undefined

const gateResult = (verdict: DispatchDoctrineVerdict): DispatchGateResult =>
  Match.value(verdict).pipe(
    Match.tag('DeliverDoctrine', (v) => ({ block: true as const, reason: v.reason })),
    Match.tag('Allow', () => undefined),
    Match.exhaustive,
  )

const readDoctrineSkills = (
  cwd: string,
): Effect.Effect<readonly string[], PlatformError, ProjectConfig> =>
  Effect.gen(function*() {
    const loader = yield* ProjectConfig
    const config: TomlConfig = yield* loader.load(cwd)
    return config['dispatch_doctrine_skills'] ?? []
  })

export type DispatchDoctrineCheck = {
  readonly skills: readonly string[]
  readonly gate: DispatchGateResult
}

interface DoctrinePhases extends Cell.Phases {
  readonly command: { readonly cwd: string; readonly toolName: string; readonly doctrineLoaded: boolean }
  readonly raw: readonly string[]
  readonly decoded: CheckDispatchCommand
  readonly decision: DispatchDoctrineVerdict
  readonly decisionError: DispatchDoctrineImpossible
  readonly output: DispatchDoctrineCheck
  readonly response: DispatchDoctrineCheck
  readonly decodeError: never
  readonly readError: PlatformError
  readonly writeError: never
  readonly readContext: ProjectConfig
  readonly writeContext: never
}

export function runDispatchDoctrineCheck(
  cwd: string,
  toolName: string,
  doctrineLoaded: boolean,
): Effect.Effect<DispatchDoctrineCheck, PlatformError, ProjectConfig> {
  let skills: readonly string[] = []
  return Cell.apply(
    pipe(
      Cell.read<DoctrinePhases>(({ cwd: dir }) =>
        Effect.tap(readDoctrineSkills(dir), (loaded) => {
          skills = loaded
        })
      ),
      Cell.decode<DoctrinePhases>((loaded) =>
        Result.succeed(
          new CheckDispatchCommand({
            toolName,
            doctrineLoaded,
            gateEnabled: loaded.length > 0,
          }),
        )
      ),
      Cell.decide<DoctrinePhases>(checkDispatchDoctrine),
      Cell.encode<DoctrinePhases>((outcome) => ({
        skills,
        gate: Result.match(outcome, {
          onFailure: () => undefined,
          onSuccess: gateResult,
        }),
      })),
      Cell.write<DoctrinePhases>((check) => Effect.succeed(check)),
    ),
    { cwd, toolName, doctrineLoaded },
  )
}

export const dispatchDoctrinePure = { extractSpecShape, matchesDoctrineSkillPath } as const
