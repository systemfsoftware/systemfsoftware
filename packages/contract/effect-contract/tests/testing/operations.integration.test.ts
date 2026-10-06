import { operationStoreLaws } from '@systemfsoftware/effect-contract/testing'
import { makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { it } from '@systemfsoftware/effect-gherkin-spec'
import { operationsScenarioEnvironment } from '../__fixtures__/operations-runtime.fixture.js'

const Feature = makeFeature({ it })
const laws = operationStoreLaws(operationsScenarioEnvironment)

Feature(laws.title)
  .withScenarioLayer(laws.layer)
  .body(laws.body)
