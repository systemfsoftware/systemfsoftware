import { operationStoreLaws } from '@systemfsoftware/effect-contract/testing'
import { it, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { storeLayer } from '../__fixtures__/operations-runtime.fixture.js'

const Feature = makeFeature({ it })
const laws = operationStoreLaws(storeLayer)

Feature(laws.title)
  .withScenarioLayer(laws.layer)
  .live('a real workerd runtime runs the operation store Durable Object')
  .body(laws.body)
