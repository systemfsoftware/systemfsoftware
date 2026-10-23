import { LawSite } from '@systemfsoftware/effect-e2e-conformance'
import type { EngineSubject } from '@systemfsoftware/effect-e2e-conformance'
import { Engine, type EngineCapability, type MemorySite, type SemanticNode } from '@systemfsoftware/effect-e2e/engine'

export const LAW_ORIGIN = 'http://law-site.test'

export const everyCapability: ReadonlyArray<EngineCapability> = [
  'web',
  'screenshot',
  'vision',
  'network',
  'drag',
  'file-upload',
  'frames',
]

export const webOnly: ReadonlyArray<EngineCapability> = ['web']

const node = (
  id: string,
  role: string,
  name: string,
  extra: Partial<Pick<SemanticNode, 'value' | 'states' | 'children'>> = {},
): SemanticNode => ({
  ref: { id, revision: '1' },
  role,
  name,
  states: { disabled: false, hidden: false },
  children: [],
  ...extra,
})

const home: ReadonlyArray<SemanticNode> = [
  node('title', 'heading', 'Engine law site'),
  node('form-link', 'link', LawSite.linkFromHomeToForm),
]

const form: ReadonlyArray<SemanticNode> = [
  node('signup', 'form', 'Signup', {
    children: [
      node('email', 'textbox', LawSite.emptyTextbox, { value: '' }),
      node('subscribe', 'checkbox', LawSite.uncheckedCheckbox, {
        states: { disabled: false, hidden: false, checked: false },
      }),
      node('save', 'button', LawSite.button),
      node('delete-draft', 'button', LawSite.twoButtonsNamed),
      node('delete-account', 'button', LawSite.twoButtonsNamed),
      node('archive', 'button', LawSite.disabledButton, { states: { disabled: true, hidden: false } }),
    ],
  }),
]

export const lawSite = (capabilities: ReadonlyArray<EngineCapability>): MemorySite => ({
  origin: LAW_ORIGIN,
  capabilities,
  pages: {
    [LawSite.home]: { tree: home, links: { 'form-link': LawSite.form }, logs: [] },
    [LawSite.form]: {
      tree: form,
      links: {},
      logs: [
        { _tag: 'Console', level: 'log', text: LawSite.consoleTextOnFormOpen },
        {
          _tag: 'Network',
          method: 'GET',
          url: `${LAW_ORIGIN}${LawSite.assetAnsweringNotFoundOnFormOpen}`,
          status: 404,
        },
      ],
    },
  },
})

export const memorySubject = (capabilities: ReadonlyArray<EngineCapability>): EngineSubject => ({
  name: `in-memory (${capabilities.join(', ')})`,
  origin: LAW_ORIGIN,
  layer: Engine.layerTest(lawSite(capabilities)),
})
