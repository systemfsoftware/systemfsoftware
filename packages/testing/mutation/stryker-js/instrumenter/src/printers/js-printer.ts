import { generate } from '../babel/babel-generator.js'
import { type JSAst } from '../syntax/index.js'

import { type Printer } from './index.js'

export const print: Printer<JSAst> = (file) => {
  return generate(file.root, { sourceMaps: false }).code
}
