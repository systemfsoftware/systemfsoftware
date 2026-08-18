import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import process from 'node:process'

/** List the entry names directly inside a directory URL. */
export const listDirectory = (dirUrl) => readdirSync(dirUrl)

/** Read a file as raw bytes. */
export const readBytes = (fileUrl) => readFileSync(fileUrl)

/** Read a text file as a UTF-8 string. */
export const readTextFile = (fileUrl) => readFileSync(fileUrl, 'utf8')

/** Write a text file, replacing any existing content. */
export const writeTextFile = (fileUrl, text) => writeFileSync(fileUrl, text)

/** Whether a file exists at the URL. */
export const fileExists = (fileUrl) => existsSync(fileUrl)

/** A process environment variable, or undefined when unset. */
export const readEnv = (name) => process.env[name]

/** Parse a JSON document into a plain value. */
export const parseJson = (text) => JSON.parse(text)