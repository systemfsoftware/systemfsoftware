import { inject } from 'vitest'

export const WORKDIR = '/work'

export const CORE_WORKDIR = `${WORKDIR}/core`

export const CLI_BIN = `${WORKDIR}/node_modules/.bin/stryker`

export const CORE_CLI_BIN = `${CORE_WORKDIR}/node_modules/.bin/stryker`

export const fixtureDir = (name: string): string => `${WORKDIR}/fixtures/${name}`

export const strykerContainerId = (): string => inject('strykerContainerId')
