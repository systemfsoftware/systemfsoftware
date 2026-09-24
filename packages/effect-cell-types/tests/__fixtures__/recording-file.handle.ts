import { Handle } from '@systemfsoftware/effect-cell-types'

import type { FileDriver } from './recording-driver.js'

export const RecordingFile = Handle.make({
  name: 'RecordingFile',
  shape: Handle.shape<FileDriver, { readonly path: string }>(),
  release: [[(file) => file.close('release')]],
  operations: {
    read: (file, _file, length: number) => file.read(length),
  },
})

export const read = RecordingFile.operations.read
