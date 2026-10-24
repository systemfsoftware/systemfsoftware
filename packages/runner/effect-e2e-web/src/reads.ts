import type { AutomationUnsupported, Locator as EngineLocator, ReadResult } from '@systemfsoftware/effect-e2e/engine'
import { ReadRequest } from '@systemfsoftware/effect-e2e/engine'
import * as Effect from 'effect/Effect'
import type { Locator } from 'playwright'

import { located } from './actions.js'
import type { TargetFailure } from './failure.js'
import { onTarget, type OpenSession } from './session.js'

const valueOf = (locator: Locator, request: ReadRequest): Promise<ReadResult> =>
  ReadRequest.match(request, {
    Text: async (): Promise<ReadResult> => ({ _tag: 'Text', text: (await locator.textContent()) ?? '' }),
    Value: async (): Promise<ReadResult> => ({ _tag: 'Value', value: await locator.inputValue() }),
    Attribute: async ({ name }): Promise<ReadResult> => ({
      _tag: 'Attribute',
      name,
      value: await locator.getAttribute(name),
    }),
    Visible: async (): Promise<ReadResult> => ({ _tag: 'Visible', visible: await locator.isVisible() }),
    Enabled: async (): Promise<ReadResult> => ({ _tag: 'Enabled', enabled: await locator.isEnabled() }),
    Checked: async (): Promise<ReadResult> => ({ _tag: 'Checked', checked: await locator.isChecked() }),
    Bounds: async (): Promise<ReadResult> => ({ _tag: 'Bounds', bounds: await locator.boundingBox() }),
  })

const attachedValueOf = (request: ReadRequest) => async (locator: Locator): Promise<ReadResult> => {
  await locator.waitFor({ state: 'attached' })
  return valueOf(locator, request)
}

export const readOn =
  (open: OpenSession) =>
  (target: EngineLocator, request: ReadRequest): Effect.Effect<ReadResult, TargetFailure | AutomationUnsupported> =>
    Effect.flatMap(located(open)(target), (targeted) => onTarget(targeted)(attachedValueOf(request)))
