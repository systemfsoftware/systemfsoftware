import * as Context from 'effect/Context'
import * as Option from 'effect/Option'

export interface TestFileInfo {
  readonly name: string
  readonly projectName: string | undefined
  readonly rootName: string
}

export interface RunnerFile {
  readonly filepath: string
  readonly name: string
  readonly projectName: string | undefined
}

export const TestFile = Context.Reference<Option.Option<TestFileInfo>>(
  '@systemfsoftware/effect-spec-runtime/TestFile',
  { defaultValue: Option.none },
)

const rootNameOf = (filepath: string, name: string): string => {
  const root = filepath.slice(0, filepath.length - name.length - 1)
  return root.slice(root.lastIndexOf('/') + 1)
}

const projectNameOf = (projectName: string | undefined): string | undefined =>
  projectName === '' ? undefined : projectName

export const testFileInfo = (file: RunnerFile): TestFileInfo => {
  const name = file.name.replaceAll('\\', '/')
  return { name, projectName: projectNameOf(file.projectName), rootName: rootNameOf(file.filepath, name) }
}
