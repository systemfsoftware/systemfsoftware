import { it } from '@systemfsoftware/vitest'
import { Match } from 'effect'
import * as Result from 'effect/Result'

import {
  ConfigTarget,
  type ConfigTemplateDecision,
  resolveConfigTemplate,
} from '../resolve-config-template.workflow.js'

const admitsOccupancy = (target: ConfigTarget, decision: ConfigTemplateDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('TemplateRefused', () => target.occupied),
    Match.tag('TemplateWritten', () => !target.occupied),
    Match.exhaustive,
  )

it.prop(
  '∀t_ConfigTemplate_≡Occupancy',
  { of: [ConfigTarget], subject: resolveConfigTemplate },
  (subject, [target]) => admitsOccupancy(target, subject(target).pipe(Result.merge)),
)
