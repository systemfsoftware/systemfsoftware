import { EngineUnavailable } from './errors.schema.js'

export interface Locator {
  readonly toContainText: (text: string) => Promise<void>
}

export interface AppFixture {
  readonly open: (path: string) => Promise<void>
}

export interface AgentFixture {
  readonly act: (goal: string) => Promise<void>
  readonly assert: (statement: string) => Promise<void>
  readonly waitFor: (condition: string) => Promise<void>
}

export interface ScreenFixture {
  readonly getByRole: (role: string) => Locator
}

export interface PlatformFixture {
  readonly name: string
}

export interface Fixtures {
  readonly app: AppFixture
  readonly agent: AgentFixture
  readonly screen: ScreenFixture
  readonly platform: PlatformFixture
}

const refuse = async (operation: string): Promise<never> => {
  throw new EngineUnavailable({ operation })
}

export const makeFixtures = (platform: string): Fixtures => ({
  app: { open: () => refuse('app.open') },
  agent: {
    act: () => refuse('agent.act'),
    assert: () => refuse('agent.assert'),
    waitFor: () => refuse('agent.waitFor'),
  },
  screen: {
    getByRole: () => ({ toContainText: () => refuse('screen.locator.toContainText') }),
  },
  platform: { name: platform },
})
