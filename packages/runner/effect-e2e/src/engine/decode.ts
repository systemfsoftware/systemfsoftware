import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Schema from 'effect/Schema'

import { Action } from './action.schema.js'
import type { Locator } from './locator.schema.js'
import { Observation, observationDepth, TreeDepthExceeded } from './observation.schema.js'
import type { SemanticNode } from './semantic-node.schema.js'

const TREE_DEPTH_BUDGET = 64

const strict = { onExcessProperty: 'error' } as const

const withinTreeBudget = (observation: Observation): Effect.Effect<Observation, TreeDepthExceeded> => {
  const depth = observationDepth(observation)
  return depth > TREE_DEPTH_BUDGET
    ? Effect.fail(new TreeDepthExceeded({ budget: TREE_DEPTH_BUDGET, depth }))
    : Effect.succeed(observation)
}

export const decodeObservation = (
  input: typeof Observation.Encoded,
): Effect.Effect<Observation, Schema.SchemaError | TreeDepthExceeded> =>
  Schema.decodeEffect(Observation, strict)(input).pipe(Effect.flatMap(withinTreeBudget))

export const decodeAction = (input: typeof Action.Encoded): Effect.Effect<Action, Schema.SchemaError> =>
  Schema.decodeEffect(Action, strict)(input)

const leafNode: SemanticNode = {
  ref: { id: 'n', revision: 'r' },
  states: { disabled: false, hidden: false },
  children: [],
}

const parentOf = (child: SemanticNode): SemanticNode => ({
  ref: leafNode.ref,
  states: leafNode.states,
  children: [child],
})

const chainOf = (length: number): SemanticNode =>
  Arr.makeBy(length - 1, () => parentOf).reduce((child, wrap) => wrap(child), leafNode)

const observedForest = (rootLengths: ReadonlyArray<number>): typeof Observation.Encoded => ({
  route: { origin: 'https://app.example.test', path: '/', query: [] },
  revision: 'r1',
  tree: rootLengths.map(chainOf),
})

const depthVerdict = (rootLengths: ReadonlyArray<number>): string =>
  decodeObservation(observedForest(rootLengths)).pipe(
    Effect.as('accepted'),
    Effect.catchTag('TreeDepthExceeded', (error) => Effect.succeed(`exceeded:${error.budget}:${error.depth}`)),
    Effect.orElseSucceed(() => 'refused'),
    Effect.runSync,
  )

const expectedVerdict = (deepest: number): string => (deepest <= 64 ? 'accepted' : `exceeded:64:${deepest}`)

const actionDecodes = (input: typeof Action.Encoded): boolean =>
  decodeAction(input).pipe(Effect.runSyncExit, Exit.isSuccess)

const saveButton: Locator = {
  expression: { kind: 'ByRole', role: 'button', name: { value: 'Save', exact: true } },
  label: 'Save',
}

const actionRows = (text: string): ReadonlyArray<readonly [typeof Action.Encoded, string]> => [
  [{ _tag: 'Navigate', url: `/${text}` }, 'target'],
  [{ _tag: 'Tap', target: saveButton }, 'value'],
  [{ _tag: 'Fill', target: saveButton, value: text }, 'url'],
  [{ _tag: 'Fill', target: saveButton, value: { secret: 'smtp_password' } }, 'key'],
  [{ _tag: 'Fill', target: saveButton, value: { credential: 'admin' } }, 'checked'],
  [{ _tag: 'Type', target: saveButton, text }, 'option'],
  [{ _tag: 'Press', target: saveButton, key: 'Enter' }, 'text'],
  [{ _tag: 'Select', target: saveButton, option: { _tag: 'ByLabel', label: text } }, 'from'],
  [{ _tag: 'Check', target: saveButton, checked: true }, 'point'],
  [{ _tag: 'Hover', target: saveButton }, 'label'],
  [{ _tag: 'Drag', from: saveButton, to: saveButton }, 'target'],
  [{ _tag: 'Swipe', direction: 'up', momentum: 'fast' }, 'path'],
  [{ _tag: 'SwipePath', path: [{ x: 0, y: 0 }, { x: 10, y: 40 }] }, 'direction'],
  [{ _tag: 'TapAt', point: { x: 4, y: 8 } }, 'target'],
  [{ _tag: 'TypeAt', point: { x: 4, y: 8 }, text: { secret: 'smtp_password' } }, 'key'],
  [{ _tag: 'Screenshot', label: text }, 'locator'],
  [{ _tag: 'WaitFor', locator: saveButton, state: 'attached', timeout: 5000 }, 'checked'],
]

const tapOn = (expression: Locator['expression']): typeof Action.Encoded => ({
  _tag: 'Tap',
  target: { expression, label: 'target' },
})

const locatorRows = (text: string): ReadonlyArray<readonly [Locator['expression'], string]> => [
  [{ kind: 'ByRole', role: 'textbox' }, 'testId'],
  [{ kind: 'ByLabel', text: { value: text, exact: false } }, 'role'],
  [{ kind: 'ByPlaceholder', text: { value: text, exact: true } }, 'testId'],
  [{ kind: 'ByText', text: { value: text, exact: false } }, 'css'],
  [{ kind: 'ByTestId', testId: text }, 'text'],
  [{ kind: 'Selector', css: `#${text}` }, 'role'],
  [{ kind: 'Filter', inner: { kind: 'ByRole', role: 'row' }, text: { value: text, exact: false } }, 'index'],
  [{ kind: 'Nth', inner: { kind: 'ByTestId', testId: text }, index: 'last' }, 'frame'],
  [{ kind: 'Frame', inner: { kind: 'ByText', text: { value: text, exact: true } }, frame: 'checkout' }, 'css'],
]

const secretAndCredential = { secret: 'smtp_password', credential: 'admin' }

const refusedFills: ReadonlyArray<typeof Action.Encoded> = [
  { _tag: 'Fill', target: saveButton, value: { secret: '1bad' } },
  { _tag: 'Fill', target: saveButton, value: secretAndCredential },
]

const depthSeeds = [1, 63, 64, 65, 200]

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as undefined, so a static import would ship the test runner.
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀n_DeepestRoot_≡AcceptedIffAtMost64',
    { of: [Schema.Int], subject: depthVerdict, runs: 100, arbitrary: { seed: 496_004 } },
    (subject, [drawn]) =>
      Arr.every(
        Arr.append(depthSeeds, (Math.abs(drawn) % 130) + 1),
        (length) =>
          Arr.every([[length], [1, length], [length, 1]], (roots) => subject(roots) === expectedVerdict(length)),
      ),
  )

  it.prop(
    '∀s_ActionVariant_≡RefusesForeignField',
    { of: [Schema.String], subject: actionDecodes, runs: 100, arbitrary: { seed: 496_005 } },
    (subject, [text]) =>
      Arr.every(actionRows(text), ([action, foreign]) => subject(action) && !subject({ ...action, [foreign]: text })) &&
      Arr.every(refusedFills, (action) => !subject(action)),
  )

  it.prop(
    '∀s_LocatorVariant_≡RefusesForeignField',
    { of: [Schema.String], subject: actionDecodes, runs: 100, arbitrary: { seed: 496_006 } },
    (subject, [text]) =>
      Arr.every(
        locatorRows(text),
        ([expression, foreign]) =>
          subject(tapOn(expression)) && !subject(tapOn(Object.assign({ [foreign]: text }, expression))),
      ),
  )
}
