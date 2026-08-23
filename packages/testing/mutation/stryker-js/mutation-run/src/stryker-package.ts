import fs from 'fs'
import { fileURLToPath, URL } from 'url'

import { deepFreeze } from '@systemfsoftware/stryker-js-util'
import * as S from 'effect/Schema'

import { PackageJsonSchema } from './stryker-package.schema.js'

const rawPackageJson: unknown = JSON.parse(
  fs.readFileSync(
    fileURLToPath(new URL('../package.json', import.meta.url)),
    'utf-8',
  ),
)
const pkg = deepFreeze(S.decodeUnknownSync(PackageJsonSchema)(rawPackageJson))

export const strykerVersion = pkg.version
export const strykerEngines = pkg.engines
