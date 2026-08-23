/// <reference types="node" />
import * as childProcess from 'node:child_process'
import { promisify } from 'node:util'

export const childProcessAsPromised = {
  exec: promisify(childProcess.exec),
}
