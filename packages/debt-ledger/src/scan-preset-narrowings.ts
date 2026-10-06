import { Array as Arr, Option, Schema } from 'effect'
import { parseSync } from 'oxc-parser'
import { PresetNarrowing } from './Entry.schema.js'
import { asRecord, type Raw, type RawObject } from './raw.js'

export interface PresetSource {
  readonly file: string
  readonly package: string
  readonly source: string
}

interface Narrowing {
  readonly rule: string
  readonly files: ReadonlyArray<string>
}

interface OverrideInfo {
  readonly files: ReadonlyArray<string>
  readonly rules: ReadonlyArray<string>
}

interface Collected {
  readonly consts: ReadonlyMap<string, Raw>
  readonly objects: ReadonlyArray<RawObject>
}

const stringOf = (value: Raw): Option.Option<string> => Schema.decodeUnknownOption(Schema.String)(value)

const arrayOf = (value: Raw): ReadonlyArray<Raw> =>
  Option.getOrElse(Schema.decodeUnknownOption(Schema.Array(Schema.Unknown))(value), () => [])

const typeOf = (record: RawObject): string => Option.getOrElse(stringOf(record['type']), () => '')

const keyName = (key: Raw): Option.Option<string> =>
  Option.orElse(
    Option.flatMap(asRecord(key), (record) => stringOf(record['name'])),
    () => Option.flatMap(asRecord(key), (record) => stringOf(record['value'])),
  )

const elementsOf = (record: RawObject): ReadonlyArray<Raw> => arrayOf(record['elements'])

const propertiesOf = (record: RawObject): ReadonlyArray<RawObject> =>
  Arr.getSomes(Arr.map(arrayOf(record['properties']), (value) => asRecord(value)))

const spreadArgumentOf = (node: Raw): Option.Option<Raw> =>
  Option.flatMap(
    asRecord(node),
    (record) => typeOf(record) === 'SpreadElement' ? Option.some(record['argument']) : Option.none(),
  )

const budgeted = (depth: number, node: Raw): Option.Option<Raw> => depth < 32 ? Option.some(node) : Option.none()

const WRAPPER_FIELDS: Readonly<Record<string, string>> = {
  TSAsExpression: 'expression',
  TSSatisfiesExpression: 'expression',
  TSNonNullExpression: 'expression',
  ParenthesizedExpression: 'expression',
}

const resolveStep = (node: Raw, consts: ReadonlyMap<string, Raw>): Option.Option<Raw> =>
  Option.flatMap(asRecord(node), (record) =>
    Option.match(Option.fromNullishOr(WRAPPER_FIELDS[typeOf(record)]), {
      onNone: () => Option.flatMap(stringOf(record['name']), (name) => Option.fromNullishOr(consts.get(name))),
      onSome: (field) => Option.fromNullishOr(record[field]),
    }))

const resolve = (node: Raw, consts: ReadonlyMap<string, Raw>, depth = 0): Raw =>
  Option.match(Option.flatMap(budgeted(depth, node), (value) => resolveStep(value, consts)), {
    onNone: () => node,
    onSome: (next) => next === node ? node : resolve(next, consts, depth + 1),
  })

const objectOf = (node: Raw, consts: ReadonlyMap<string, Raw>): Option.Option<RawObject> =>
  Option.flatMap(
    asRecord(resolve(node, consts)),
    (record) => typeOf(record) === 'ObjectExpression' ? Option.some(record) : Option.none(),
  )

const propertiesOfNode = (node: Raw, consts: ReadonlyMap<string, Raw>): ReadonlyArray<RawObject> =>
  Option.getOrElse(Option.map(objectOf(node, consts), (object) => propertiesOf(object)), () => [])

const arrayElementsOf = (node: Raw, consts: ReadonlyMap<string, Raw>): ReadonlyArray<Raw> =>
  Option.getOrElse(
    Option.flatMap(
      asRecord(resolve(node, consts)),
      (record) => typeOf(record) === 'ArrayExpression' ? Option.some(elementsOf(record)) : Option.none(),
    ),
    () => [],
  )

const fieldOfProperty = (
  property: RawObject,
  name: string,
  consts: ReadonlyMap<string, Raw>,
): Option.Option<Raw> =>
  Option.match(spreadArgumentOf(property), {
    onNone: () =>
      Option.flatMap(
        keyName(property['key']),
        (key) => key === name ? Option.some(property['value']) : Option.none(),
      ),
    onSome: (argument) => objectField(argument, name, consts),
  })

const objectField = (node: Raw, name: string, consts: ReadonlyMap<string, Raw>): Option.Option<Raw> =>
  Option.flatMap(objectOf(node, consts), (object) =>
    Arr.head(
      Arr.getSomes(Arr.map(propertiesOf(object), (property) => fieldOfProperty(property, name, consts))),
    ))

const valueOfField = (node: RawObject, name: string, consts: ReadonlyMap<string, Raw>): Raw =>
  Option.getOrElse(objectField(node, name, consts), (): Raw => [])

const literalStringOf = (node: Raw, consts: ReadonlyMap<string, Raw>): Option.Option<string> =>
  Option.flatMap(
    asRecord(resolve(node, consts)),
    (record) => typeOf(record) === 'Literal' ? stringOf(record['value']) : Option.none(),
  )

const stringsOfElement = (element: Raw, consts: ReadonlyMap<string, Raw>): ReadonlyArray<string> =>
  Option.match(spreadArgumentOf(element), {
    onNone: () => Arr.getSomes([literalStringOf(element, consts)]),
    onSome: (argument) => stringsOf(argument, consts),
  })

const stringsOf = (node: Raw, consts: ReadonlyMap<string, Raw>): ReadonlyArray<string> =>
  Option.match(literalStringOf(node, consts), {
    onNone: () => Arr.flatMap(arrayElementsOf(node, consts), (element) => stringsOfElement(element, consts)),
    onSome: (value) => [value],
  })

const keysOfProperty = (property: RawObject, consts: ReadonlyMap<string, Raw>): ReadonlyArray<string> =>
  Option.match(spreadArgumentOf(property), {
    onNone: () => Arr.getSomes([keyName(property['key'])]),
    onSome: (argument) => ruleKeysOf(argument, consts),
  })

const ruleKeysOf = (node: Raw, consts: ReadonlyMap<string, Raw>): ReadonlyArray<string> =>
  Arr.flatMap(propertiesOfNode(node, consts), (property) => keysOfProperty(property, consts))

const arrayObjects = (node: Raw, consts: ReadonlyMap<string, Raw>): ReadonlyArray<RawObject> =>
  Arr.flatMap(arrayElementsOf(node, consts), (element) =>
    Option.match(spreadArgumentOf(element), {
      onNone: () => Arr.getSomes([objectOf(element, consts)]),
      onSome: (argument) => arrayObjects(argument, consts),
    }))

const hasAdditionalTestBlockFunctions = (node: Raw, consts: ReadonlyMap<string, Raw>): boolean =>
  Arr.some(
    arrayElementsOf(node, consts),
    (element) =>
      Arr.some(
        propertiesOf(Option.getOrElse(objectOf(element, consts), () => ({}))),
        (property) => Option.getOrUndefined(keyName(property['key'])) === 'additionalTestBlockFunctions',
      ),
  )

const declaratorOf = (record: RawObject): Option.Option<{ readonly name: string; readonly init: Raw }> =>
  typeOf(record) === 'VariableDeclarator'
    ? Option.flatMap(
      asRecord(record['id']),
      (id) =>
        Option.flatMap(
          stringOf(id['name']),
          (name) => Option.map(Option.fromNullishOr(record['init']), (init) => ({ name, init })),
        ),
    )
    : Option.none()

const collect = (program: Raw): Collected => {
  const consts = new Map<string, Raw>()
  const objects: Array<RawObject> = []
  const visit = (node: Raw): void =>
    Option.match(asRecord(node), {
      onNone: (): void => {
        Arr.forEach(arrayOf(node), visit)
      },
      onSome: (record): void => {
        Option.match(declaratorOf(record), {
          onNone: (): void => undefined,
          onSome: ({ name, init }): void => {
            consts.set(name, init)
          },
        })
        Option.match(objectOf(record, consts), {
          onNone: (): void => undefined,
          onSome: (): void => {
            objects.push(record)
          },
        })
        Arr.forEach(Object.values(record), visit)
      },
    })
  visit(program)
  return { consts, objects }
}

const overrideInfosOf = (object: RawObject, consts: ReadonlyMap<string, Raw>): ReadonlyArray<OverrideInfo> =>
  Option.getOrElse(
    Option.map(
      objectField(object, 'overrides', consts),
      (overrides) =>
        Arr.map(arrayObjects(overrides, consts), (override) => ({
          files: stringsOf(valueOfField(override, 'files', consts), consts),
          rules: ruleKeysOf(valueOfField(override, 'rules', consts), consts),
        })),
    ),
    () => [],
  )

const isSoleScopedRule = (
  infos: ReadonlyArray<OverrideInfo>,
  index: number,
  info: OverrideInfo,
  rule: string,
): boolean =>
  Arr.some(infos, (other, otherIndex) => otherIndex !== index && Arr.contains(other.rules, rule))
    ? false
    : Arr.some(
      infos,
      (other, otherIndex) =>
        otherIndex !== index && Arr.some(other.rules, (candidate) => Arr.contains(info.rules, candidate)),
    )

const configNarrowingsOf = (object: RawObject, consts: ReadonlyMap<string, Raw>): ReadonlyArray<Narrowing> => {
  const infos = overrideInfosOf(object, consts)
  return Arr.flatMap(
    infos,
    (info, index) =>
      info.files.length === 0 ? [] : Arr.flatMap(
        info.rules,
        (rule) => isSoleScopedRule(infos, index, info, rule) ? [{ rule, files: info.files }] : [],
      ),
  )
}

const excludedOf = (object: RawObject, consts: ReadonlyMap<string, Raw>): ReadonlyArray<string> =>
  Arr.dedupe([
    ...stringsOf(valueOfField(object, 'excludeFiles', consts), consts),
    ...stringsOf(valueOfField(object, 'ignores', consts), consts),
  ])

const excludedRulesOf = (object: RawObject, consts: ReadonlyMap<string, Raw>): ReadonlyArray<string> =>
  excludedOf(object, consts).length === 0 ? [] : ruleKeysOf(valueOfField(object, 'rules', consts), consts)

const additionalBlockRulesOf = (object: RawObject, consts: ReadonlyMap<string, Raw>): ReadonlyArray<string> =>
  Arr.flatMap(
    propertiesOf(object),
    (property) =>
      hasAdditionalTestBlockFunctions(property['value'], consts) ? Arr.getSomes([keyName(property['key'])]) : [],
  )

export const scanPresetNarrowings = (input: PresetSource): ReadonlyArray<PresetNarrowing> => {
  const parsed = parseSync(input.file, input.source)
  const { consts, objects } = collect(parsed.program)
  const emitted = new Map<string, PresetNarrowing>()
  const add = (rule: string, files: ReadonlyArray<string>): void => {
    const deduped = Arr.dedupe([...files])
    const key = `${rule}\u0000${deduped.join('\u0000')}`
    Option.match(Option.fromNullishOr(emitted.get(key)), {
      onNone: (): void => {
        emitted.set(key, PresetNarrowing.make({ package: input.package, rule, files: deduped }))
      },
      onSome: (): void => undefined,
    })
  }
  Arr.forEach(objects, (object) => {
    Arr.forEach(excludedRulesOf(object, consts), (rule) => add(rule, excludedOf(object, consts)))
    Arr.forEach(additionalBlockRulesOf(object, consts), (rule) => add(rule, []))
  })
  Arr.forEach(objects, (object) => {
    Arr.forEach(configNarrowingsOf(object, consts), (narrowing) => add(narrowing.rule, narrowing.files))
  })
  return [...emitted.values()]
}
