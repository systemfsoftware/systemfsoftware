import fs from 'fs'
import { fileURLToPath, URL } from 'url'

import { deepFreeze } from '@stryker-mutator/util'

const pkg = deepFreeze(
  JSON.parse(
    fs.readFileSync(
      fileURLToPath(new URL('../package.json', import.meta.url)),
      'utf-8',
    ),
  ) as {
    version: string
    engines: { node: string }
  },
)

export const strykerVersion = pkg.version
export const strykerEngines = pkg.engines
