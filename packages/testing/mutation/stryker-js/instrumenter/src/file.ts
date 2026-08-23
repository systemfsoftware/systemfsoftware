import { type FileDescription } from '@systemfsoftware/stryker-js-plugin-api/core'

export interface File extends FileDescription {
  name: string
  content: string
}
