import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'
import { noBodylessStatusAssertion } from '../no-bodyless-status-assertion.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
  },
})

ruleTester.run('no-bodyless-status-assertion', noBodylessStatusAssertion, {
  valid: [
    {
      name: 'Should_Allow_When_CheckResponseWithBodyIsUsed',
      code: `await checkResponseWithBody(response, 200)`,
    },
    {
      name: 'Should_Allow_When_StatusComparedToStringLiteral',
      code: `expect(finalData.status).toBe('ASSIGNED')`,
    },
    {
      name: 'Should_Allow_When_StatusComparedToVariable',
      code: `expect(response.status).toBe(expectedStatus)`,
    },
    {
      name: 'Should_Allow_When_NonStatusPropertyComparedToNumber',
      code: `expect(response.length).toBe(200)`,
    },
    {
      name: 'Should_Allow_When_NonExpectCallWrapsStatusMember',
      code: `assert(response.status).toBe(200)`,
    },
    {
      name: 'Should_Allow_When_ComputedStatusMemberComparedToNumber',
      code: `expect(response['status']).toBe(200)`,
    },
    {
      name: 'Should_Allow_When_MatcherIsNotEquality',
      code: `expect(response.status).toBeGreaterThan(200)`,
    },
  ],
  invalid: [
    {
      name: 'Should_Flag_When_CheckResponseCalled',
      code: `checkResponse(response, 200)`,
      errors: [{ messageId: 'preferCheckResponseWithBody' }],
    },
    {
      name: 'Should_Flag_When_ExpectStatusToBeNumber',
      code: `expect(response.status).toBe(200)`,
      errors: [{ messageId: 'bodylessStatusAssertion' }],
    },
    {
      name: 'Should_Flag_When_ExpectStatusToBeNonOkNumber',
      code: `expect(response.status).toBe(402)`,
      errors: [{ messageId: 'bodylessStatusAssertion' }],
    },
    {
      name: 'Should_Flag_When_ExpectStatusToEqualNumber',
      code: `expect(response.status).toEqual(404)`,
      errors: [{ messageId: 'bodylessStatusAssertion' }],
    },
    {
      name: 'Should_Flag_When_ExpectStatusToStrictEqualNumber',
      code: `expect(response.status).toStrictEqual(204)`,
      errors: [{ messageId: 'bodylessStatusAssertion' }],
    },
  ],
})
