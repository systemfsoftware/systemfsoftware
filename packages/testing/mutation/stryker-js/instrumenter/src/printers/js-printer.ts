import { type JSAst } from '../syntax/index.js'
import { generate } from '../util/babel-generator.js'

import { type Printer } from './index.js'

export const print: Printer<JSAst> = (file) => {
  return generate(file.root, { sourceMaps: false }).code
}
