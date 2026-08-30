# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/test-runner.e2e.ts >> Should_SupportExpectedEffectFailures_When_FailureThrown
- Location: src/internal/test.ts:348:22

# Error details

```
ExpectedTestError:
```

# Test source

```ts
  60  |   await page.goto('data:text/html,<title>Promise</title>')
  61  |   await expect(page).toHaveTitle('Promise')
  62  | })
  63  | 
  64  | test.effect('Should_ProvidePlaywrightServices_When_EffectTestRuns', () =>
  65  |   Effect.gen(function*() {
  66  |     const page = yield* Playwright.Page
  67  |     const context = yield* Playwright.BrowserContext
  68  |     const browser = yield* Playwright.Browser
  69  | 
  70  |     yield* page.goto('data:text/html,<title>Effect Playwright</title>')
  71  |     expect(yield* page.title).toBe('Effect Playwright')
  72  |     expect(context.pages()).toHaveLength(1)
  73  |     expect(browser.contexts()).toHaveLength(1)
  74  |   }))
  75  | 
  76  | layer(sharedLayer)('shared Effect layer', (it) => {
  77  |   it.effect('Should_ProvideLayerService_When_LayerAcquired', () =>
  78  |     Effect.gen(function*() {
  79  |       const value = yield* SharedValue
  80  |       expect(value.acquisition).toBe(1)
  81  |     }))
  82  | 
  83  |   it.scoped('Should_ReuseLayerAcquisition_When_ScopedTestRuns', () =>
  84  |     Effect.gen(function*() {
  85  |       const value = yield* SharedValue
  86  |       expect(value.acquisition).toBe(1)
  87  |       expect(sharedLayerAcquisitions).toBe(1)
  88  |     }))
  89  | 
  90  |   it('Should_PreserveSourceLocations_When_PlainTestRuns', ({ page }, testInfo) => {
  91  |     expect(page).toBeDefined()
  92  |     expect(testInfo.file).toMatch(/e2e[\\/]test-runner\.e2e\.ts$/)
  93  |   })
  94  | 
  95  |   it.layer(nestedLayer)('nested Effect layer', (nestedIt) => {
  96  |     nestedIt.effect('Should_ProvideParentAndNestedServices_When_NestedLayerUsed', () =>
  97  |       Effect.gen(function*() {
  98  |         expect((yield* SharedValue).acquisition).toBe(1)
  99  |         expect(yield* NestedValue).toBe(2)
  100 |       }))
  101 |   })
  102 | 
  103 |   // Runs after the layer's own release hook, which is registered first.
  104 |   it.afterAll(() => {
  105 |     expect(sharedLayerAcquisitions).toBe(1)
  106 |     expect(sharedLayerReleases).toBe(1)
  107 |   })
  108 | })
  109 | 
  110 | layer(anonymousLayer)((it) => {
  111 |   it.effect('Should_SupportAnonymousLayerBlock_When_AnonymousLayerProvided', () =>
  112 |     Effect.gen(function*() {
  113 |       expect(yield* AnonymousValue).toBe('anonymous')
  114 |     }))
  115 | 
  116 |   it.afterAll(() => {
  117 |     expect(anonymousLayerAcquisitions).toBe(1)
  118 |     expect(anonymousLayerReleases).toBe(1)
  119 |   })
  120 | })
  121 | 
  122 | const customTest = makeMethods(
  123 |   base.extend<{ value: string }>({
  124 |     // oxlint-disable-next-line eslint/no-empty-pattern -- Playwright requires a destructuring first arg; this fixture provides a constant.
  125 |     value: async ({}, use) => use('custom fixture'),
  126 |   }),
  127 | )
  128 | 
  129 | customTest.effect(
  130 |   'Should_UseCustomFixture_When_CustomFixtureProvided',
  131 |   ({ value }) => Effect.sync(() => expect(value).toBe('custom fixture')),
  132 | )
  133 | 
  134 | customTest.layer(Layer.succeed(CustomLayerValue, 'custom layer'))(
  135 |   'custom test layer',
  136 |   (it) => {
  137 |     it.effect('Should_CombineCustomFixturesAndLayerServices_When_BothProvided', ({ value }) =>
  138 |       Effect.gen(function*() {
  139 |         expect(value).toBe('custom fixture')
  140 |         expect(yield* CustomLayerValue).toBe('custom layer')
  141 |       }))
  142 |   },
  143 | )
  144 | 
  145 | test.effect('Should_SupportTestDetails_When_DetailsProvided', { tag: '@effect' }, () => Effect.void)
  146 | 
  147 | test('Should_ExposeEveryEffectModifier_When_ModifiersAccessed', async () => {
  148 |   expect(String(typeof test.effect.only)).toBe('function')
  149 |   expect(String(typeof test.effect.skip)).toBe('function')
  150 |   expect(String(typeof test.effect.fixme)).toBe('function')
  151 |   expect(String(typeof test.effect.fail)).toBe('function')
  152 |   expect(String(typeof test.effect.fail.only)).toBe('function')
  153 |   expect(String(typeof test.layer)).toBe('function')
  154 | })
  155 | 
  156 | test.effect.skip('Should_SupportSkippedEffectTests_When_Skipped', () => Effect.void)
  157 | test.effect.fixme('Should_SupportFixmeEffectTests_When_Fixme', () => Effect.void)
  158 | test.effect.fail('Should_SupportExpectedEffectFailures_When_FailureThrown', () => {
  159 |   class ExpectedTestError extends Schema.TaggedError<ExpectedTestError>()('ExpectedTestError', {}) {}
> 160 |   return new ExpectedTestError()
      |          ^ ExpectedTestError: 
  161 | })
  162 |
```
