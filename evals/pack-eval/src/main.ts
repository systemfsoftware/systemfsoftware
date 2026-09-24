import { OpenRouterClient, OpenRouterLanguageModel } from '@effect/ai-openrouter'
import { NodeClusterHttp, NodeHttpClient, NodeRuntime, NodeServices } from '@effect/platform-node'
import { Config, Effect, Layer, Option } from 'effect'
import type * as Crypto from 'effect/Crypto'
import type * as FileSystem from 'effect/FileSystem'
import type * as Path from 'effect/Path'
import { Command } from 'effect/unstable/cli'
import * as RunnerAddress from 'effect/unstable/cluster/RunnerAddress'
import * as ShardingConfig from 'effect/unstable/cluster/ShardingConfig'
import {
  AnswerCacheFailure,
  EffectCli,
  FileAnswerCache,
  OpenRouterRuleSelector,
  OpenRouterTaskGenerator,
  RuleSelector,
  TaskGenerator,
} from './PackEval/mod.js'

const apiKey = Config.map(Config.option(Config.Redacted('OPENROUTER_API_KEY')), Option.getOrUndefined)

const nodeLayer = Layer.mergeAll(NodeServices.layer, NodeHttpClient.layerNodeHttp)

const baseLayer = Layer.provideMerge(OpenRouterClient.layerConfig({ apiKey }), nodeLayer)

const languageStackOf = (model: string, workDir: string) =>
  Layer.merge(OpenRouterLanguageModel.layer({ model }), FileAnswerCache.layer({ cacheDir: `${workDir}/cache` }))

const selectorStackOf = (
  model: string,
  workDir: string,
): Layer.Layer<
  RuleSelector,
  AnswerCacheFailure,
  OpenRouterClient.OpenRouterClient | Crypto.Crypto | FileSystem.FileSystem | Path.Path
> => Layer.provideMerge(OpenRouterRuleSelector.layer({ model }), languageStackOf(model, workDir))

const generatorStackOf = (
  model: string,
  workDir: string,
): Layer.Layer<
  TaskGenerator,
  AnswerCacheFailure,
  OpenRouterClient.OpenRouterClient | Crypto.Crypto | FileSystem.FileSystem | Path.Path
> => Layer.provideMerge(OpenRouterTaskGenerator.layer({ model }), languageStackOf(model, workDir))
const reviewStackOf = (port: number) =>
  Layer.provideMerge(
    NodeClusterHttp.layerHttpServer,
    ShardingConfig.layer({ runnerListenAddress: Option.some(RunnerAddress.make('127.0.0.1', port)) }),
  )
const root = Command.make('pack-eval').pipe(
  Command.withDescription(EffectCli.DESCRIPTION),
  Command.withSubcommands([
    Command.provide(EffectCli.evaluate, (input) => selectorStackOf(input.selectorModel, input.workDir)),
    Command.provide(EffectCli.trace, (input) => selectorStackOf(input.selectorModel, input.workDir)),
    Command.provide(EffectCli.generate, (input) => generatorStackOf(input.generatorModel, input.workDir)),
    Command.provide(EffectCli.review, (input) => reviewStackOf(input.port)),
    EffectCli.fingerprint,
  ]),
)

NodeRuntime.runMain(Effect.provide(Command.run(root, { version: EffectCli.VERSION }), baseLayer))
