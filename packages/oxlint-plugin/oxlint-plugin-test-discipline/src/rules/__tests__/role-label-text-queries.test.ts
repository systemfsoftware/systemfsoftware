import { roleLabelTextQueries } from '../role-label-text-queries.js'
import { createRuleTester } from './_tester.js'

const ruleTester = createRuleTester()

const PATH = '/repo/pkg/tests/checkout.spec.ts'

ruleTester.run('role-label-text-queries', roleLabelTextQueries, {
  valid: [
    {
      name: 'Should_StaySilent_When_QueryIsByRole',
      code: "screen.getByRole('button', { name: 'Save' })",
      filename: PATH,
    },
    { name: 'Should_StaySilent_When_QueryIsByLabel', code: "screen.getByLabelText('Email')", filename: PATH },
    { name: 'Should_StaySilent_When_QueryIsByText', code: "screen.findByText('Welcome')", filename: PATH },
    {
      name: 'Should_StaySilent_When_QueryIsAQueryAllByVariant',
      code: "screen.queryAllByRole('listitem')",
      filename: PATH,
    },
    {
      name: 'Should_StaySilent_When_FilterUsesHasText',
      code: "page.getByRole('list').filter({ hasText: 'Item' })",
      filename: PATH,
    },
    { name: 'Should_StaySilent_When_ChainUsesPosition', code: "page.getByRole('row').nth(2).last()", filename: PATH },
    {
      name: 'Should_StaySilent_When_QueryReadsAnAriaSnapshot',
      code: "page.getByRole('main').ariaSnapshot()",
      filename: PATH,
    },
    {
      name: 'Should_StaySilent_When_QueryReadsAnAttribute',
      code: "expect(screen.getByRole('link').getAttribute('href')).toBe('/x')",
      filename: PATH,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_QueryIsACssLocator',
      code: "page.locator('.submit')",
      filename: PATH,
      errors: [{ messageId: 'bannedQuery', data: { name: 'locator' } }],
    },
    {
      name: 'Should_Report_When_QueryIsAHandleLookup',
      code: "page.$('.submit')",
      filename: PATH,
      errors: [{ messageId: 'bannedQuery', data: { name: '$' } }],
    },
    {
      name: 'Should_Report_When_QueryIsAnAllHandleLookup',
      code: "page.$$('.submit')",
      filename: PATH,
      errors: [{ messageId: 'bannedQuery', data: { name: '$$' } }],
    },
    {
      name: 'Should_Report_When_QueryIsAEvalOverHandle',
      code: "page.$eval('.submit', (el) => el)",
      filename: PATH,
      errors: [{ messageId: 'bannedQuery', data: { name: '$eval' } }],
    },
    {
      name: 'Should_Report_When_QueryIsAnAllEvalOverHandle',
      code: "page.$$eval('.submit', (els) => els)",
      filename: PATH,
      errors: [{ messageId: 'bannedQuery', data: { name: '$$eval' } }],
    },
    {
      name: 'Should_Report_When_QueryIsQuerySelector',
      code: "document.querySelector('.submit')",
      filename: PATH,
      errors: [{ messageId: 'bannedQuery', data: { name: 'querySelector' } }],
    },
    {
      name: 'Should_Report_When_QueryIsQuerySelectorAll',
      code: "document.querySelectorAll('.submit')",
      filename: PATH,
      errors: [{ messageId: 'bannedQuery', data: { name: 'querySelectorAll' } }],
    },
    {
      name: 'Should_Report_When_QueryIsClosest',
      code: "element.closest('.row')",
      filename: PATH,
      errors: [{ messageId: 'bannedQuery', data: { name: 'closest' } }],
    },
    {
      name: 'Should_Report_When_QueryIsByTestId',
      code: "screen.getByTestId('submit')",
      filename: PATH,
      errors: [{ messageId: 'bannedQuery', data: { name: 'getByTestId' } }],
    },
    {
      name: 'Should_Report_When_QueryIsByPlaceholder',
      code: "screen.getByPlaceholder('Email')",
      filename: PATH,
      errors: [{ messageId: 'bannedQuery', data: { name: 'getByPlaceholder' } }],
    },
    {
      name: 'Should_Report_When_QueryIsByAltText',
      code: "screen.getByAltText('logo')",
      filename: PATH,
      errors: [{ messageId: 'bannedQuery', data: { name: 'getByAltText' } }],
    },
    {
      name: 'Should_Report_When_QueryIsByTitle',
      code: "screen.getByTitle('Save')",
      filename: PATH,
      errors: [{ messageId: 'bannedQuery', data: { name: 'getByTitle' } }],
    },
    {
      name: 'Should_Report_When_QueryIsFrameLocator',
      code: "page.frameLocator('#frame')",
      filename: PATH,
      errors: [{ messageId: 'bannedQuery', data: { name: 'frameLocator' } }],
    },
    {
      name: 'Should_Report_When_QueryIsAComputedBannedMember',
      code: "page['locator']('.submit')",
      filename: PATH,
      errors: [{ messageId: 'bannedQuery', data: { name: 'locator' } }],
    },
    {
      name: 'Should_Report_When_FilterUsesTheHasOption',
      code: "page.getByRole('list').filter({ has: other })",
      filename: PATH,
      errors: [{ messageId: 'hasOption', data: { name: 'has' } }],
    },
    {
      name: 'Should_Report_When_FilterUsesTheHasNotOption',
      code: "page.getByRole('list').filter({ hasNot: other })",
      filename: PATH,
      errors: [{ messageId: 'hasOption', data: { name: 'hasNot' } }],
    },
    {
      name: 'Should_Report_When_StringIsADataAttributeSelector',
      code: "page.getByText('[data-testid]')",
      filename: PATH,
      errors: [{ messageId: 'dataAttributeSelector', data: { snippet: '[data-testid]' } }],
    },
    {
      name: 'Should_Report_When_TemplateIsADataAttributeSelector',
      code: 'page.getByLabel(`[data-${name}]`)',
      filename: PATH,
      errors: [{ messageId: 'dataAttributeSelector', data: { snippet: '[data-' } }],
    },
  ],
})
