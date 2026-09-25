import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Tracer } from 'effect'

import {
  AttributedCommand,
  attributedWorkflow,
  attributionCell,
  Connected,
  refusingCell,
} from './__fixtures__/cell-attribution.fixture.js'

const Feature = makeFeature({ it })

const fixtureFile = new URL('./__fixtures__/cell-attribution.fixture.ts', import.meta.url).pathname

type SpanAttributes = Tracer.NativeSpan['attributes']

const attributesOf = <A, E, R>(name: string, program: Effect.Effect<A, E, R>): Effect.Effect<SpanAttributes, E, R> => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    },
  })
  return Effect.map(Effect.withTracer(program, tracer), () => {
    const span = spans.find((candidate) => candidate.name === name)
    if (span === undefined) throw new Error(`the run opened no span named ${name}`)
    return span.attributes
  })
}

const inFixture = (attributes: SpanAttributes, key: string): boolean =>
  String(attributes.get(key)).startsWith(fixtureFile)

const command = new AttributedCommand({ evidence: new Connected({}), length: 3, secret: 7 })

Feature('A cell span carries where the cell and its workflow were made')
  .withScenarioLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A named cell records its site, its decide site, its command tag, its member tags and its declared fields',
      Gherkin.Do.pipe(
        When('a command with one tagged member runs through the named cell')(
          'attributes',
          () => attributesOf('tests.cell.attribution', attributionCell.run(command)),
        ),
        Then('the cell span carries the attribution and leaks no raw command data')((s, expect) =>
          expect({
            name: s.attributes.get('cell.name'),
            commandTag: s.attributes.get('cell.command_tag'),
            members: s.attributes.get('cell.member_tags'),
            declared: s.attributes.get('cell.declared'),
            outcome: s.attributes.get('cell.outcome'),
            declaredAttribute: s.attributes.get('tests.cell.length'),
            leaksSecretField: s.attributes.has('secret'),
            leaksRawCommand: s.attributes.has('command'),
            siteInFixture: inFixture(s.attributes, 'cell.site'),
            decideSiteInFixture: inFixture(s.attributes, 'cell.decide_site'),
            siteSuffixed: /:\d+:\d+$/.test(String(s.attributes.get('cell.site'))),
            decideSiteSuffixed: /:\d+:\d+$/.test(String(s.attributes.get('cell.decide_site'))),
          }).toEqual({
            name: 'tests.cell.attribution',
            commandTag: 'AttributedCommand',
            members: { evidence: 'Connected' },
            declared: { length: 3 },
            outcome: 'Admitted',
            declaredAttribute: 3,
            leaksSecretField: false,
            leaksRawCommand: false,
            siteInFixture: true,
            decideSiteInFixture: true,
            siteSuffixed: true,
            decideSiteSuffixed: true,
          })
        ),
      ),
    )

    scenario(
      'A refusing workflow records the refusal tag as the cell outcome',
      Gherkin.Do.pipe(
        When('a command runs through a cell whose workflow refuses')(
          'attributes',
          () => attributesOf('tests.cell.refusing', refusingCell.run(command)),
        ),
        Then('the cell span carries the refusal tag as its outcome')((s, expect) =>
          expect({
            name: s.attributes.get('cell.name'),
            outcome: s.attributes.get('cell.outcome'),
            siteInFixture: inFixture(s.attributes, 'cell.site'),
          }).toEqual({ name: 'tests.cell.refusing', outcome: 'Malformed', siteInFixture: true })
        ),
      ),
    )

    scenario(
      'The workflow record carries the decide site beside its command, decision and error schemas',
      Gherkin.Do.pipe(
        When('the fixture workflow is read at its schema record')(
          'decideSite',
          () => Effect.succeed(attributedWorkflow[Workflow.WorkflowSchemasKey].decideSite),
        ),
        Then('the decide site names the file that made the workflow')((s, expect) =>
          expect({
            inFixture: s.decideSite.startsWith(fixtureFile),
            suffixed: /:\d+:\d+$/.test(s.decideSite),
          }).toEqual({ inFixture: true, suffixed: true })
        ),
      ),
    )
  })
