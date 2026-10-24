import {
  type ConfigDefaults,
  credentials,
  decodeConfig,
  defineConfig,
  type E2EConfig,
  type E2EConfigInput,
  secrets,
  unique,
  web,
} from '@systemfsoftware/effect-e2e'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

const Feature = makeFeature({ it })

/** The config literal of design §3.1, with the target URL the edge would read from `BASE_URL`. */
const designLiteral = (): E2EConfigInput =>
  defineConfig({
    projectId: 'acme.web',
    tests: ['tests/**/*.e2e.ts'],
    targets: [{
      name: 'web',
      engine: web({ browser: 'chromium', headless: true }),
      app: { url: 'https://staging.acme.test', identity: 'acme-web' },
    }],
    agents: {
      default: {
        model: { gateway: 'openrouter', model: 'deepseek/deepseek-flash-latest', apiKeyEnv: 'OPENROUTER_API_KEY' },
        system: 'You are a first-time customer.',
        context: 'Plans are called tiers. Billing lives under Settings.',
        maxSteps: 25,
        maxModelCalls: 25,
      },
    },
  })

const LOCAL_MACHINE: ConfigDefaults = { ci: false, projectId: 'acme-suite', cores: 8 }

const CI_MACHINE: ConfigDefaults = { ci: true, projectId: 'acme-suite', cores: 8 }

const filledFields = (config: E2EConfig) => ({
  projectId: config.projectId,
  tests: config.tests,
  platform: config.targets[0].platform,
  timeoutMillis: [
    config.timeout,
    config.launchTimeout,
    config.actionTimeout,
    config.assertionTimeout,
    config.cleanupTimeout,
  ]
    .map(Duration.toMillis),
  retries: config.retries,
  workers: config.workers,
  cache: config.cache,
  secrets: config.secrets,
  credentials: config.credentials,
  reporters: config.reporters,
  output: config.output,
  trace: config.trace,
})

/** Decodes on a local machine and keeps only where a refusal points: the first `depth` key-path segments. */
const refusalPath = (config: E2EConfigInput, depth: number) =>
  Effect.result(Effect.mapError(decodeConfig(config, LOCAL_MACHINE), (refusal) => refusal.path.slice(0, depth)))

const withTopLevelTypo = (): E2EConfigInput => Object.assign(designLiteral(), { retry: 2 })

const withNestedExtra = (): E2EConfigInput => {
  const config = designLiteral()
  const [target] = config.targets
  return { ...config, targets: [{ ...target, app: Object.assign({ ...target.app }, { region: 'eu' }) }] }
}

const withoutTargets = (): E2EConfigInput => {
  const { targets: _targets, ...rest } = designLiteral()
  // @ts-expect-error -- the input type refuses a config without targets; decode must refuse it at run time too
  return rest
}

const holdingEngine = (engine: object): E2EConfigInput => {
  const config = designLiteral()
  // @ts-expect-error -- a live value in engine position is what decode must refuse
  return { ...config, targets: [{ ...config.targets[0], engine }] }
}

const OPENROUTER_MODEL = {
  gateway: 'openrouter',
  model: 'deepseek/deepseek-flash-latest',
  apiKeyEnv: 'OPENROUTER_API_KEY',
}

const COMPATIBLE_MODEL = {
  gateway: 'openai-compatible',
  baseURL: 'https://models.acme.test/v1',
  model: 'acme-vision',
  apiKeyEnv: 'ACME_MODEL_KEY',
}

const withModel = (model: object): E2EConfigInput => {
  const config = designLiteral()
  return { ...config, agents: { default: { ...config.agents?.['default'], model } } }
}

const modelVisionOf = (config: E2EConfigInput) =>
  Effect.result(
    Effect.mapBoth(decodeConfig(config, LOCAL_MACHINE), {
      onFailure: (refusal) => refusal.path.slice(0, 4),
      onSuccess: (decoded) => decoded.agents['default']?.model.vision,
    }),
  )

Feature('Decoding a suite config at the edge')
  .withLayer(Layer.empty)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'The design literal decodes with every unset field at its documented default',
      Gherkin.Do.pipe(
        Given('the config literal of design §3.1')('config', () => Effect.succeed(designLiteral())),
        When('the edge decodes it on a local machine')('decoded', ({ config }) => decodeConfig(config, LOCAL_MACHINE)),
        Then('the decoded config carries the design table defaults')((state, expect) =>
          expect(filledFields(state.decoded)).toEqual({
            projectId: 'acme.web',
            tests: ['tests/**/*.e2e.ts'],
            platform: 'web',
            timeoutMillis: [120_000, 60_000, 30_000, 5_000, 30_000],
            retries: 0,
            workers: 4,
            cache: { mode: 'read-write' },
            secrets: {},
            credentials: {},
            reporters: ['list'],
            output: '.e2e',
            trace: 'retain-on-failure',
          })
        ),
      ),
    )

    scenarioOutline(
      'The run shape defaults follow the machine the run is on',
      [
        { machine: LOCAL_MACHINE, retries: 0, workers: 4, mode: 'read-write' },
        { machine: CI_MACHINE, retries: 1, workers: 1, mode: 'read-only' },
      ],
      ({ machine, retries, workers, mode }) =>
        Gherkin.Do.pipe(
          Given('a config that leaves retries, workers and the cache mode unset')('config', () =>
            Effect.succeed(designLiteral())),
          When("the edge decodes it with that machine's defaults")('decoded', ({ config }) =>
            decodeConfig(config, machine)),
          Then('the run shape is the one the design table gives that machine')((state, expect) =>
            expect({ retries: state.decoded.retries, workers: state.decoded.workers, cache: state.decoded.cache })
              .toEqual({ retries, workers, cache: { mode } })
          ),
        ),
    )

    scenarioOutline(
      'A config the schema does not admit is refused with the key path that broke',
      [
        { shape: 'an unknown top-level key', config: withTopLevelTypo, depth: 1, path: ['retry'] },
        {
          shape: 'an unknown key in a target app',
          config: withNestedExtra,
          depth: 4,
          path: ['targets', 0, 'app', 'region'],
        },
        { shape: 'no targets', config: withoutTargets, depth: 1, path: ['targets'] },
      ],
      ({ config, depth, path }) =>
        Gherkin.Do.pipe(
          Given('a config with a key the schema does not admit')('config', () => Effect.succeed(config())),
          When('the edge decodes it')('outcome', (state) => refusalPath(state.config, depth)),
          Then('the refusal names the key path')((state, expect) =>
            expect(state.outcome).toMatchObject({ _tag: 'Failure', failure: path })
          ),
        ),
    )

    scenarioOutline(
      'An engine held as a live value is refused at the engine key',
      [
        { held: 'a function', engine: () => web({ browser: 'chromium' }) },
        { held: 'a Layer', engine: Layer.empty },
        { held: 'a client', engine: { ...web({ browser: 'chromium' }), send: () => Promise.resolve() } },
      ],
      ({ engine }) =>
        Gherkin.Do.pipe(
          Given('a target whose engine is not plain engine data')(
            'config',
            () => Effect.succeed(holdingEngine(engine)),
          ),
          When('the edge decodes it')('outcome', (state) => refusalPath(state.config, 3)),
          Then('the refusal points at the engine')((state, expect) =>
            expect(state.outcome).toMatchObject({ _tag: 'Failure', failure: ['targets', 0, 'engine'] })
          ),
        ),
    )

    scenarioOutline(
      "A model's vision flag decodes strictly and defaults to text only",
      [
        { flag: 'unset on openrouter', model: OPENROUTER_MODEL, outcome: { _tag: 'Success', success: false } },
        {
          flag: 'unset on a compatible gateway',
          model: COMPATIBLE_MODEL,
          outcome: { _tag: 'Success', success: false },
        },
        { flag: 'true', model: { ...COMPATIBLE_MODEL, vision: true }, outcome: { _tag: 'Success', success: true } },
        {
          flag: 'a string',
          model: { ...OPENROUTER_MODEL, vision: 'yes' },
          outcome: { _tag: 'Failure', failure: ['agents', 'default', 'model', 'vision'] },
        },
      ],
      ({ model, outcome }) =>
        Gherkin.Do.pipe(
          Given('an agent whose model states its vision flag that way')(
            'config',
            () => Effect.succeed(withModel(model)),
          ),
          When('the edge decodes it')('outcome', (state) => modelVisionOf(state.config)),
          Then('the decoded flag, or the refusal path, is the one the schema gives')((state, expect) =>
            expect(state.outcome).toMatchObject(outcome)
          ),
        ),
    )

    scenario(
      'The web engine helper returns its spec as plain data',
      Gherkin.Do.pipe(
        When('a suite names the web engine')('engine', () => Effect.sync(() => web({ browser: 'chromium' }))),
        Then('the engine is the web spec with its defaults filled')((state, expect) =>
          expect(state.engine).toEqual({
            _tag: 'WebEngine',
            adapter: '@systemfsoftware/effect-e2e-web',
            browser: 'chromium',
            headless: true,
            contextHeaders: {},
          })
        ),
      ),
    )

    scenarioOutline(
      'A config value helper returns plain data the replay cache can key on',
      [
        {
          helper: 'unique',
          value: (): object => unique('e2e+1@younna.org'),
          data: { _tag: 'Unique', value: 'e2e+1@younna.org' },
        },
        { helper: 'secrets', value: (): object => secrets.get('monitor'), data: { secret: 'monitor' } },
        {
          helper: 'credentials',
          value: (): object => credentials.user('qa'),
          data: { name: 'qa', password: { credential: 'qa' } },
        },
      ],
      ({ value, data }) =>
        Gherkin.Do.pipe(
          When('a suite calls the helper')('value', () => Effect.sync(value)),
          Then('the value is the plain data the helper names')((state, expect) => expect(state.value).toEqual(data)),
        ),
    )
  })
