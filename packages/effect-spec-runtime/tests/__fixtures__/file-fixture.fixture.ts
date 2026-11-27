import { TestFile, type TestFileInfo } from '@systemfsoftware/effect-spec-runtime'
import { Context, Effect, Layer, Option } from 'effect'

export class FileFixture extends Context.Service<FileFixture, { readonly file: Option.Option<TestFileInfo> }>()(
  '@systemfsoftware/effect-spec-runtime/tests/FileFixture',
) {}

export const fileLayer = Layer.effect(FileFixture, Effect.map(TestFile, (file) => ({ file })))

export const runtimeTestFile = (name: string): Option.Option<TestFileInfo> =>
  Option.some({ name, projectName: undefined, rootName: 'effect-spec-runtime' })
