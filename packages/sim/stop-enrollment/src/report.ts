import * as Option from 'effect/Option'
import { allOf, branch } from './branch.js'
import { TestScriptSkipsConformance } from './StopEnrollmentFailure.schema.js'
import type { UnlinkedUnit } from './StopEnrollmentFailure.schema.js'

/** What one package's run found: what enrolled, what a stop rule reaches, and what it missed. */
export interface StopEnrollmentReport {
  readonly enrolled: number
  readonly linked: number
  readonly direct: number
  readonly transitive: number
  readonly unlinked: readonly UnlinkedUnit[]
  readonly unrouted: readonly TestScriptSkipsConformance[]
}

export const projectNamesOf = (script: string): readonly string[] | undefined => {
  const names = [...script.matchAll(/--project(?:=|\s+)([^\s=]+)/gu)]
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined)
  return names.length === 0 ? undefined : names
}

export const runsConformanceProject = (test: string | undefined): boolean =>
  Option.match(Option.fromUndefinedOr(test), {
    onNone: () => true,
    onSome: (script) =>
      Option.match(Option.fromUndefinedOr(projectNamesOf(script)), {
        onNone: () => true,
        onSome: (names) => names.includes('conformance'),
      }),
  })

export const exitCodeOf = (report: StopEnrollmentReport): number =>
  branch({
    on: allOf([report.unlinked.length === 0, report.unrouted.length === 0]),
    yes: () => 0,
    no: () => 1,
  })

export const renderReport = (report: StopEnrollmentReport): readonly string[] => {
  const breakdown = `${report.direct} linked directly, ${report.transitive} reached through declarations`
  return [
    ...report.unlinked.map((finding) => finding.message),
    ...report.unrouted.map((finding) => finding.message),
    `stop enrollment: ${report.enrolled} enrolled module(s), ${report.linked} with a stop rule (${breakdown})`,
  ]
}

export const unroutedFor = (input: {
  readonly packageName: string
  readonly testScript: string | undefined
  readonly linked: number
}): readonly TestScriptSkipsConformance[] =>
  branch({
    on: allOf([
      input.testScript !== undefined,
      input.linked > 0,
      !runsConformanceProject(input.testScript),
    ]),
    yes: () => [
      TestScriptSkipsConformance.make({
        packageName: input.packageName,
        testScript: Option.getOrElse(Option.fromUndefinedOr(input.testScript), () => ''),
      }),
    ],
    no: () => [],
  })
