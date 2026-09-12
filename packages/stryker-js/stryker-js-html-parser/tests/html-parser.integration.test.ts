import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { htmlParser, isParseFailed, makeHtmlParser, strykerPlugins } from '@systemfsoftware/stryker-js-html-parser'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { EXTERNAL_SCRIPT_HTML, INLINE_SCRIPTS_HTML, MALFORMED_HTML } from './__fixtures__/HtmlDocuments.fixtures.js'

const Feature = makeFeature({ it, layer })

Feature('Mutating the scripts an html page carries')
  .body(({ scenario }) => {
    scenario(
      'A mutation run discovers the plugin as the parser for html pages',
      Gherkin.Do.pipe(
        Given('the plugin package a mutation run loads')(
          'loaded',
          () => Effect.succeed({ htmlParser, strykerPlugins }),
        ),
        When('the run reads the declarations the package exports')(
          'declaration',
          (s) =>
            Effect.sync(() => ({
              named: s.loaded.htmlParser.name,
              declared: s.loaded.strykerPlugins.map((contribution) => `${contribution.kind}:${contribution.name}`),
              claimed: makeHtmlParser().extensions,
            })),
        ),
        Then('it finds a single html parser, claiming html pages')((s) =>
          Effect.sync(() => {
            expect(s.declaration).toEqual({ named: 'html', declared: ['Parser:html'], claimed: ['.html'] })
          })
        ),
      ),
    )

    scenario(
      'A plain script and a typed script are both reported as bodies to mutate',
      Gherkin.Do.pipe(
        Given('an html page with one plain script and one script declaring typescript')(
          'page',
          () => Effect.succeed(INLINE_SCRIPTS_HTML),
        ),
        When('the page is parsed')('parsed', (s) => Effect.sync(() => makeHtmlParser().parse(s.page, 'index.html'))),
        Then('each body is reported with where it sits, its text and its language')((s) =>
          Effect.sync(() => {
            expect(s.parsed).toEqual({
              originFileName: 'index.html',
              rawContent: INLINE_SCRIPTS_HTML,
              format: 'html',
              root: {
                scripts: [
                  {
                    range: { start: 44, end: 61 },
                    format: 'js',
                    content: 'const answer = 42',
                    offset: { line: 3, column: 44 },
                  },
                  {
                    range: { start: 106, end: 132 },
                    format: 'ts',
                    content: "const label: string = 'ok'",
                    offset: { line: 4, column: 106 },
                  },
                ],
              },
            })
          })
        ),
      ),
    )

    scenario(
      'A script that loads a file from elsewhere offers no body to mutate',
      Gherkin.Do.pipe(
        Given('the only script of an html page loads a file from elsewhere')(
          'page',
          () => Effect.succeed(EXTERNAL_SCRIPT_HTML),
        ),
        When('the page is parsed')('parsed', (s) => Effect.sync(() => makeHtmlParser().parse(s.page, 'index.html'))),
        Then('no script body is reported')((s) =>
          Effect.sync(() => {
            expect(s.parsed).toEqual({
              originFileName: 'index.html',
              rawContent: EXTERNAL_SCRIPT_HTML,
              format: 'html',
              root: { scripts: [] },
            })
          })
        ),
      ),
    )

    scenario(
      'A page whose tag closes where nothing was opened is reported as a parse failure',
      Gherkin.Do.pipe(
        Given('an html page with a closing tag that matches no opening tag')(
          'page',
          () => Effect.succeed(MALFORMED_HTML),
        ),
        When('the page is parsed')('parsed', (s) => Effect.sync(() => makeHtmlParser().parse(s.page, 'index.html'))),
        Then('the outcome names the file, the reported problem and where it sits')((s) =>
          Effect.sync(() => {
            if (!isParseFailed(s.parsed)) {
              throw new Error('a mismatched closing tag must be reported as a parse failure')
            }
            expect(s.parsed).toMatchObject({
              _tag: 'ParseFailed',
              fileName: 'index.html',
              location: { line: 4, column: 9 },
            })
            expect(s.parsed.message).toContain('Unexpected closing tag "span"')
          })
        ),
      ),
    )
  })
