import { it } from '@systemfsoftware/vitest'
import { Match } from 'effect'
import * as Result from 'effect/Result'

import { ExtendsTarget, type ExtendsTargetDecision, resolveExtendsTarget } from '../resolve-extends-target.workflow.js'

const readsAsRelative = (specifier: string): boolean =>
  specifier.startsWith('./') ||
  specifier.startsWith('../') ||
  specifier.startsWith('.\\') ||
  specifier.startsWith('..\\')

const admits = (command: ExtendsTarget, decision: ExtendsTargetDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('RelativeExtendsTarget', (relative) =>
      readsAsRelative(command.specifier) &&
      relative.specifier === command.specifier &&
      relative.fromFolder === command.fromFolder),
    Match.tag('ModuleExtendsTarget', (module) =>
      !readsAsRelative(command.specifier) &&
      module.specifier === command.specifier &&
      module.fromFolder === command.fromFolder),
    Match.exhaustive,
  )

it.prop(
  '∀e_TargetDecision_≡SpecifierRelativity',
  { of: [ExtendsTarget], subject: resolveExtendsTarget },
  (subject, [command]) => admits(command, subject(command).pipe(Result.merge)),
)
