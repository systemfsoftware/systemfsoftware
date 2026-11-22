import { expect, it } from 'vitest'

it('Should_BeRefuted_When_Run', () => {
  expect.fail(
    [
      'Property refuted',
      'Rerun only this scenario:',
      '  pnpm --filter @scope/pkg exec vitest run src/a.test.ts -t "Should_BeRefuted_When_Run"',
    ].join('\n'),
  )
})
