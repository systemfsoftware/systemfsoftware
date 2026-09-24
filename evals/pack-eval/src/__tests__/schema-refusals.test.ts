import { Option, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { PairLabel } from '../labels.schema.js'
import { PackRule, RuleFile } from '../pack-rule.schema.js'
import { Task } from '../task-set.schema.js'

const CRUST_PATH = '/packs/bakery/crust.md'

const ruleFileOf = (text: string): RuleFile => new RuleFile({ path: CRUST_PATH, packId: 'bakery', stem: 'crust', text })

describe('rule file refusals', () => {
  it('refuses a file with no frontmatter block', () => {
    const outcome = RuleFile.decode(ruleFileOf('just a body, no delimiters'))
    expect(Result.isFailure(outcome)).toBe(true)
  })

  it('names the refused file', () => {
    const outcome = RuleFile.decode(ruleFileOf('just a body'))
    expect(
      Result.match(outcome, { onFailure: (refusal) => refusal.path, onSuccess: () => null }),
    ).toBe(CRUST_PATH)
  })

  it('refuses unparseable yaml', () => {
    const outcome = RuleFile.decode(ruleFileOf('---\ntitle: [unclosed\n---\nbody'))
    expect(Result.isFailure(outcome)).toBe(true)
  })

  it('refuses a missing title', () => {
    const outcome = RuleFile.decode(ruleFileOf('---\napplies_when:\n  - heuristics\ntags: []\n---\nbody'))
    expect(Result.isFailure(outcome)).toBe(true)
  })

  it('refuses applies_when given as a bare string', () => {
    const outcome = RuleFile.decode(ruleFileOf('---\ntitle: Crust\napplies_when: heuristics\ntags: []\n---\nbody'))
    expect(Result.isFailure(outcome)).toBe(true)
  })

  it('decodes a well-formed rule file', () => {
    const outcome = RuleFile.decode(
      ruleFileOf('---\ntitle: Crust\napplies_when:\n  - heuristics\ntags: [routing]\n---\nthe body'),
    )
    expect(Result.getOrThrow(outcome)).toEqual(
      new PackRule({
        packId: 'bakery',
        stem: 'crust',
        title: 'Crust',
        appliesWhen: ['heuristics'],
        tags: ['routing'],
        body: 'the body',
      }),
    )
  })
})

describe('split refusals', () => {
  it('refuses a pair split outside train, dev, and test', () => {
    const decoded = Schema.decodeUnknownOption(PairLabel)({
      id: 'pair-1',
      taskId: 'task-1',
      packId: 'bakery',
      ruleA: 'crust',
      ruleB: 'crumb',
      split: 'prod',
      verdict: 'Pass',
      origin: 'observed',
      notes: '',
    })
    expect(Option.isNone(decoded)).toBe(true)
  })

  it('refuses a task split outside dev and test', () => {
    const decoded = Schema.decodeUnknownOption(Task)({
      id: 'task-1',
      text: 'task',
      split: 'train',
      dimensions: {},
    })
    expect(Option.isNone(decoded)).toBe(true)
  })
})
