import { Effect } from 'effect'
import type * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import type * as Path from 'effect/Path'
import { anyOf, branch } from '../branch.js'
import { ambiguousUnit, SystemfError, unknownUnit } from '../contract/errors.js'
import type { Coverage, Reach, UnitKindName, UnitListData, UnitRow, UnitShowData } from '../contract/result.js'
import type { UnitModule } from '../unit/enroll.js'
import { packageRun } from './check.js'
import { unlinkedFinding } from './findings.js'

/** What `systemf unit list` asks: which package, which kinds, and whether to show only uncovered units. */
export interface UnitListRequest {
  readonly cwd: string
  readonly package?: string | undefined
  readonly kind?: UnitKindName | undefined
  readonly uncovered?: boolean | undefined
}

/** What `systemf unit show` asks: one unit by module path or export name. */
export interface UnitShowRequest {
  readonly cwd: string
  readonly package?: string | undefined
  readonly query: string
}

const namesOf = (unit: UnitModule): readonly string[] => unit.declarations.map((declaration) => declaration.name)

const reachesOf = (reaches: ReadonlyMap<string, readonly Reach[]>, unit: UnitModule): readonly Reach[] =>
  [...(reaches.get(unit.absolute) ?? [])].sort((left, right) =>
    branch({
      on: left.file === right.file,
      yes: () => left.line - right.line,
      no: () => left.file.localeCompare(right.file),
    })
  )

const coverageOf = (reaches: ReadonlyMap<string, readonly Reach[]>, unit: UnitModule): Coverage => {
  const found = reachesOf(reaches, unit)
  return branch({
    on: found.length === 0,
    yes: (): Coverage => 'none',
    no: (): Coverage =>
      branch({
        on: found.some((reach) => reach.mode === 'direct'),
        yes: (): Coverage => 'direct',
        no: (): Coverage => 'through-declarations',
      }),
  })
}

/** Every enrolled unit in the package, one row each. */
export const unitList = (
  request: UnitListRequest,
): Effect.Effect<UnitListData, SystemfError, FileSystem.FileSystem | Path.Path> =>
  Effect.map(packageRun({ cwd: request.cwd, target: request.package ?? '.', project: undefined }), (run) => {
    const rows: readonly UnitRow[] = run.enrollment.units
      .map((unit): UnitRow => ({
        package: run.packageName,
        module: unit.file,
        kind: unit.kind,
        declarations: namesOf(unit),
        coverage: coverageOf(run.enrollment.reaches, unit),
      }))
      .filter((row) => branch({ on: request.kind === undefined, yes: () => true, no: () => row.kind === request.kind }))
      .filter((row) => branch({ on: request.uncovered !== true, yes: () => true, no: () => row.coverage === 'none' }))
    return { units: rows }
  })

const matchesFor = (units: readonly UnitModule[], query: string): readonly UnitModule[] =>
  units.filter((unit) => anyOf([unit.file === query, unit.absolute === query, namesOf(unit).includes(query)]))

const knownNames = (units: readonly UnitModule[]): readonly string[] =>
  units.flatMap((unit) => [unit.file, ...namesOf(unit)])

const showOf = (
  packageName: string,
  reaches: ReadonlyMap<string, readonly Reach[]>,
  unit: UnitModule,
): UnitShowData => {
  const found = reachesOf(reaches, unit)
  return {
    package: packageName,
    module: unit.file,
    kind: unit.kind,
    declarations: namesOf(unit),
    reaches: found,
    ...(found.length === 0 ? { fix: unlinkedFinding(unit).fix } : {}),
  }
}

/** One unit's kind, declarations, and the stop checks that reach it. */
export const unitShow = (
  request: UnitShowRequest,
): Effect.Effect<UnitShowData, SystemfError, FileSystem.FileSystem | Path.Path> =>
  Effect.flatMap(packageRun({ cwd: request.cwd, target: request.package ?? '.', project: undefined }), (run) => {
    const matches = matchesFor(run.enrollment.units, request.query)
    return branch({
      on: matches.length === 0,
      yes: (): Effect.Effect<UnitShowData, SystemfError> =>
        Effect.fail(unknownUnit(request.query, knownNames(run.enrollment.units))),
      no: (): Effect.Effect<UnitShowData, SystemfError> =>
        branch({
          on: matches.length > 1,
          yes: (): Effect.Effect<UnitShowData, SystemfError> =>
            Effect.fail(ambiguousUnit(request.query, matches.map((unit) => unit.file))),
          no: (): Effect.Effect<UnitShowData, SystemfError> =>
            Option.match(Option.fromUndefinedOr(matches[0]), {
              onNone: () => Effect.fail(unknownUnit(request.query, knownNames(run.enrollment.units))),
              onSome: (unit) => Effect.succeed(showOf(run.packageName, run.enrollment.reaches, unit)),
            }),
        }),
    })
  })
