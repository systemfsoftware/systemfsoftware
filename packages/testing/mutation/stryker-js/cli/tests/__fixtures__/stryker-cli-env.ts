import { inject } from 'vitest'

declare module 'vitest' {
  interface ProvidedContext {
    strykerContainerId: string
  }
}

export const WORKDIR = '/work'

export const CLI_BIN = `${WORKDIR}/node_modules/.bin/stryker`

export const fixtureDir = (name: string): string => `${WORKDIR}/fixtures/${name}`

export const strykerContainerId = (): string => inject('strykerContainerId')
