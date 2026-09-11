import * as Predicate from 'effect/Predicate'
import { type Hashbang, printProgram } from './print/index.js'
import { type Ast } from './Syntax.js'

const HASHBANG_FIELDS: Readonly<Record<string, (field: unknown) => boolean>> = {
  type: (field) => field === 'Hashbang',
  value: (field) => typeof field === 'string',
  start: (field) => typeof field === 'number',
}

function isHashbang(value: unknown): value is Hashbang {
  return Predicate.isObject(value) && Object.entries(HASHBANG_FIELDS).every(([key, accepts]) => accepts(value[key]))
}

const hashbangOf = (root: Ast['root']): Hashbang | null => {
  const hashbang: unknown = Reflect.get(root, 'hashbang')
  if (!isHashbang(hashbang)) return null
  return hashbang
}

export function print(file: Ast): string {
  return printProgram(file.root, { hashbang: hashbangOf(file.root) })
}
