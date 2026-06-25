import { describe, expect, it } from 'vitest'
import { expandOutline, renderTitle, stringifyForTitle, tokenizeTemplate } from '../outline-expand.js'

describe('expandOutline', () => {
  it('Should_ExpandRows_When_RowsHaveMatchingKeys', () => {
    const rows = expandOutline('Valid login for <user>', [{ user: 'alice' }, { user: 'bob' }])

    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ row: { user: 'alice' }, title: 'Valid login for alice' })
    expect(rows[1]).toEqual({ row: { user: 'bob' }, title: 'Valid login for bob' })
  })

  it('Should_HandleMultipleTokens_When_TemplateHasSeveral', () => {
    const rows = expandOutline(
      '<user> buys <item> for <price>',
      [{ user: 'alice', item: 'book', price: '$10' }],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      row: { user: 'alice', item: 'book', price: '$10' },
      title: 'alice buys book for $10',
    })
  })

  it('Should_ReturnEmpty_When_RowsEmpty', () => {
    expect(expandOutline('some name', [])).toEqual([])
  })

  it('Should_UseTemplateName_When_NoTokensPresent', () => {
    const rows = expandOutline('Static scenario name', [{ user: 'alice' }])
    expect(rows[0]?.title).toBe('Static scenario name')
  })

  it('Should_ThrowAtRegistration_When_TemplateTagMissingFromRow', () => {
    expect(() => expandOutline('<a> and <b>', [{ a: 'only-a' }])).toThrow(
      /scenarioOutline: template tag <b> has no matching row key/,
    )
  })

  it('Should_PreserveRowAsTyped_When_RowsHaveTypedShape', () => {
    type Row = { role: 'admin' | 'user'; count: number }
    const rows = expandOutline<Row>(
      'role=<role> count=<count>',
      [{ role: 'admin', count: 3 }, { role: 'user', count: 1 }],
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]?.row).toEqual({ role: 'admin', count: 3 })
    expect(rows[0]?.title).toBe('role=admin count=3')
  })
})

describe('stringifyForTitle', () => {
  it('Should_ReturnString_When_ValueIsString', () => {
    expect(stringifyForTitle('hello')).toBe('hello')
  })

  it('Should_StringifyNumber_When_ValueIsNumber', () => {
    expect(stringifyForTitle(42)).toBe('42')
  })

  it('Should_StringifyBoolean_When_ValueIsBoolean', () => {
    expect(stringifyForTitle(true)).toBe('true')
    expect(stringifyForTitle(false)).toBe('false')
  })

  it('Should_StringifyBigint_When_ValueIsBigint', () => {
    expect(stringifyForTitle(10n)).toBe('10')
  })

  it('Should_ReturnNullLiteral_When_ValueIsNull', () => {
    expect(stringifyForTitle(null)).toBe('null')
  })

  it('Should_JsonStringify_When_ValueIsObject', () => {
    expect(stringifyForTitle({ a: 1 })).toBe('{"a":1}')
    expect(stringifyForTitle([1, 2])).toBe('[1,2]')
  })

  it('Should_Throw_When_ValueIsUndefined', () => {
    expect(() => stringifyForTitle(void 0)).toThrow(/cannot stringify undefined/)
  })
})

describe('tokenizeTemplate', () => {
  it('Should_ReturnEmpty_When_NoAngleBrackets', () => {
    expect(tokenizeTemplate('hello world')).toEqual([])
  })

  it('Should_ExtractSingleToken_When_OneTagPresent', () => {
    const result = tokenizeTemplate('<user> logs in')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ tag: 'user', rest: ' logs in' })
  })

  it('Should_ExtractMultipleTokens_When_SeveralTagsPresent', () => {
    const result = tokenizeTemplate('<user> buys <item> for <price>')
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ tag: 'user', rest: ' buys <item> for <price>' })
    expect(result[1]).toEqual({ tag: 'item', rest: ' for <price>' })
    expect(result[2]).toEqual({ tag: 'price', rest: '' })
  })

  it('Should_ReturnEmpty_When_UnclosedTag', () => {
    expect(tokenizeTemplate('<user')).toEqual([])
  })

  it('Should_ReturnEmpty_When_OnlyOpenBracket', () => {
    expect(tokenizeTemplate('<')).toEqual([])
  })

  it('Should_ExtractTag_When_NoClosingBracketInRest', () => {
    const result = tokenizeTemplate('<a>hello<b')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ tag: 'a', rest: 'hello<b' })
  })

  it('Should_SkipTextBeforeFirstOpenBracket_When_TextPrecedesTag', () => {
    const result = tokenizeTemplate('prefix<name>')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ tag: 'name', rest: '' })
  })

  it('Should_HandleEmptyTag_When_AngleBracketsAdjacent', () => {
    const result = tokenizeTemplate('<>rest')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ tag: '', rest: 'rest' })
  })

  it('Should_ContinueAfterFirstToken_When_MoreTokensFollow', () => {
    const result = tokenizeTemplate('<a>mid<b>end')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ tag: 'a', rest: 'mid<b>end' })
    expect(result[1]).toEqual({ tag: 'b', rest: 'end' })
  })
})

describe('renderTitle', () => {
  it('Should_ReplaceAllTokens_When_AllKeysPresent', () => {
    expect(renderTitle('<a> and <b>', { a: '1', b: '2' })).toBe('1 and 2')
  })

  it('Should_LeaveToken_When_KeyNotInRow', () => {
    expect(renderTitle('<a> missing <b>', { a: 'found' })).toBe('found missing <b>')
  })

  it('Should_ReturnTemplate_When_NoTokens', () => {
    expect(renderTitle('no tokens', { x: 'y' })).toBe('no tokens')
  })

  it('Should_StringifyNonStringValues_When_RowHasMixedTypes', () => {
    expect(renderTitle('<n> items', { n: 42 })).toBe('42 items')
    expect(renderTitle('<flag> active', { flag: true })).toBe('true active')
  })

  it('Should_UseCustomStringifier_When_Provided', () => {
    expect(renderTitle('<x>', { x: 'a' }, () => 'CUSTOM')).toBe('CUSTOM')
  })
})
