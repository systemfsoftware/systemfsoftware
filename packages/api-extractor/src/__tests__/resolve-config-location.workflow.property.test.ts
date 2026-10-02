import { it } from '@systemfsoftware/vitest'
import { Match, Option } from 'effect'
import * as Result from 'effect/Result'

import {
  type ConfigLocationDecision,
  ConfigSearch,
  resolveConfigLocation,
} from '../resolve-config-location.workflow.js'

const admitsSearch = (search: ConfigSearch, decision: ConfigLocationDecision): boolean =>
  Option.match(Option.fromNullishOr(search.foundPath), {
    onSome: (foundPath) =>
      Match.value(decision).pipe(
        Match.tag('ConfigLocated', (located) => located.filePath === foundPath),
        Match.tag('ConfigNotLocated', () => false),
        Match.exhaustive,
      ),
    onNone: () =>
      Match.value(decision).pipe(
        Match.tag('ConfigLocated', () => false),
        Match.tag('ConfigNotLocated', () => true),
        Match.exhaustive,
      ),
  })

it.prop(
  '∀s_ConfigLocation_≡FoundPath',
  { of: [ConfigSearch], subject: resolveConfigLocation },
  (subject, [search]) => admitsSearch(search, subject(search).pipe(Result.merge)),
)
