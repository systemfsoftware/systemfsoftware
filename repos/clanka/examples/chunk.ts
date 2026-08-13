import { Console, Effect, Layer, Stream } from "effect"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { CodeChunker } from "../src/index.ts"

Effect.gen(function* () {
  const cc = yield* CodeChunker.CodeChunker

  yield* cc.chunkCodebase().pipe(Stream.runForEach(Console.log))
}).pipe(
  Effect.provide(
    CodeChunker.layer.pipe(Layer.provideMerge(NodeServices.layer)),
  ),
  NodeRuntime.runMain,
)
