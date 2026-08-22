import { readdirSync, readFileSync } from 'node:fs'

/** List the entry names directly inside a directory URL. */
export const listDirectory = (dirUrl) => readdirSync(dirUrl)

/** Read a file as raw bytes. */
export const readBytes = (fileUrl) => readFileSync(fileUrl)
