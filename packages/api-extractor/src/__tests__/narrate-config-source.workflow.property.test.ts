import { it } from '@systemfsoftware/vitest'
import { Match } from 'effect'
import * as Result from 'effect/Result'

import {
  ConfigNarration,
  type ConfigNarrationDecision,
  narrateConfigSource,
} from '../narrate-config-source.workflow.js'

const admits = (command: ConfigNarration, decision: ConfigNarrationDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('ConfigSourceNarrated', () => command.autoLocated),
    Match.tag('ConfigSourceNotNarrated', () => !command.autoLocated),
    Match.exhaustive,
  )

it.prop(
  '∀n_ConfigNarration_≡AutoLocated',
  { of: [ConfigNarration], subject: narrateConfigSource },
  (subject, [command]) => admits(command, subject(command).pipe(Result.merge)),
)
