/**
 * Html reporter workflow — pure document construction.
 */

import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { HtmlReportCommand, HtmlReportError } from './Reporter.schema.js'

export class HtmlDocument extends S.TaggedClass<HtmlDocument>()('HtmlDocument', {
  html: S.String,
}) {}

function escapeHtmlTags(json: string): string {
  return json.replace(/</g, '<"+"')
}

function buildReportHtml(report: unknown, scriptContent: string): string {
  return `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <script>
      ${scriptContent}
    </script>
  </head>
  <body>
    <svg style="width: 80px; position:fixed; right:10px; bottom:10px; z-index:10" class="stryker-image" viewBox="0 0 1458 1458" xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="2"><path fill="none" d="M0 0h1458v1458H0z"/><clipPath id="a"><path d="M0 0h1458v1458H0z"/></clipPath><g clip-path="url(#a)"><path d="M1458 729c0 402.655-326.345 729-729 729S0 1131.655 0 729C0 326.445 326.345 0 729 0s729 326.345 729 729" fill="#e74c3c" fill-rule="nonzero"/><path d="M778.349 1456.15L576.6 1254.401l233-105 85-78.668v-64.332l-257-257-44-187-50-208 251.806-82.793L1076.6 389.401l380.14 379.15c-19.681 367.728-311.914 663.049-678.391 687.599z" fill-opacity=".3"/><path d="M753.4 329.503c41.79 0 74.579 7.83 97…</path></g></svg>
    <mutation-test-report-app titlePostfix="Stryker">
      Your browser doesn't support <a href="https://caniuse.com/#search=custom%20elements">custom elements</a>.
      Please use a latest version of an evergreen browser (Firefox, Chrome, Safari, Opera, Edge, etc).
    </mutation-test-report-app>
    <script>
      const app = document.querySelector('mutation-test-report-app');
      app.report = ${escapeHtmlTags(JSON.stringify(report))};
      function updateTheme() {
        document.body.style.backgroundColor = app.themeBackgroundColor;
      }
      app.addEventListener('theme-changed', updateTheme);
      updateTheme();
    </script>
  </body>
  </html>`
}

export const makeHtmlDocument = Workflow.make(
  HtmlReportCommand,
  (command: HtmlReportCommand): Result.Result<HtmlDocument, HtmlReportError> => {
    const html = buildReportHtml(command.report, command.scriptContent)
    return Result.succeed(HtmlDocument.make({ html }))
  },
)
