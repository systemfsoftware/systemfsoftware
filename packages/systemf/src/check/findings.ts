import { Function } from 'effect'
import * as Option from 'effect/Option'
import type { Finding } from '../contract/result.js'
import type { UnitModule } from '../unit/enroll.js'

const firstDeclarationName = (unit: UnitModule): string =>
  Option.getOrElse(
    Option.map(Option.fromUndefinedOr(unit.declarations[0]), (declaration) => declaration.name),
    () => 'the unit',
  )

export const unlinkedFinding = (unit: UnitModule): Finding => ({
  rule: 'stop-coverage',
  file: unit.file,
  declarations: unit.declarations.map((declaration) => declaration.name),
  message: 'no Conformance.stopped check reaches this unit',
  fix: `pass \`${firstDeclarationName(unit)}\` as \`unit\` to Conformance.stopped in tests/*.conformance.test.ts`,
})

export const unroutedFinding = (packageName: string): Finding => ({
  rule: 'conformance-lane',
  file: 'package.json',
  declarations: [],
  message: `${packageName}: its test script never runs the conformance project`,
  fix: 'add `--project conformance` to the package test script',
})

export const unreadableFinding: {
  (message: string): (path: string) => Finding
  (path: string, message: string): Finding
} = Function.dual(2, (path: string, message: string): Finding => ({
  rule: 'sources-readable',
  file: path,
  declarations: [],
  message: `cannot read ${path}: ${message}`,
  fix: `make ${path} a readable directory`,
}))
