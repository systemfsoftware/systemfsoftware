import type { MemorySite, SemanticNode } from '@systemfsoftware/effect-e2e/engine'

export const ORIGIN = 'https://billing.test'

export const SUITE_OUTPUT = `${import.meta.dirname}/.e2e`

export const ENGINE_OPENS = `${SUITE_OUTPUT}/engine-opens`

export const PLANTED_SECRET_ENV = 'RUNNER_SUITE_PLANTED'

export const PLANTED_SECRET = 'planted-643-"q\\b-wörd'

const node = (id: string, role: string, name: string): SemanticNode => ({
  ref: { id, revision: '1' },
  role,
  name,
  states: { disabled: false, hidden: false },
  children: [],
})

export const BILLING_SITE: MemorySite = {
  origin: ORIGIN,
  capabilities: ['web'],
  pages: {
    '/settings/billing': {
      tree: [node('plan', 'status', 'Free plan'), node('upgrade', 'button', 'Upgrade')],
      links: {},
      logs: [],
    },
  },
}
